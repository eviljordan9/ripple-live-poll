package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"ripple/internal/auth"
	"ripple/internal/polls"
	"ripple/internal/store"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

type Server struct {
	Auth  *auth.Service
	Polls *polls.Service
	Live  *store.Realtime
	Mongo *store.Mongo
}

func New(a *auth.Service, p *polls.Service, live *store.Realtime, m *store.Mongo) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool { return true },
		AllowMethods:    []string{"GET", "POST", "DELETE", "OPTIONS"},
		AllowHeaders:    []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:          12 * time.Hour,
	}))

	s := &Server{Auth: a, Polls: p, Live: live, Mongo: m}
	api := r.Group("/api")
	{
		api.GET("/health", s.health)
		api.POST("/auth/signup", s.signup)
		api.POST("/auth/login", s.login)
		api.POST("/auth/logout", s.logout)
		api.GET("/auth/me", s.me)

		api.GET("/polls/:slug", s.getPoll)
		api.GET("/polls/:slug/stream", s.streamPoll)
		api.POST("/polls/:slug/vote", s.vote)

		authd := api.Group("/")
		authd.Use(a.Require())
		{
			authd.POST("/polls", s.createPoll)
			authd.GET("/polls", s.listMine)
			authd.POST("/polls/:slug/close", s.closePoll)
			authd.POST("/polls/:slug/reopen", s.reopenPoll)
			authd.POST("/polls/:slug/rename", s.renamePoll)
			authd.DELETE("/polls/:slug", s.deletePoll)
		}
	}
	return r
}

func (s *Server) health(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	mongoOK := s.Mongo.Client.Ping(ctx, nil) == nil
	redisOK := s.Live.Ping(ctx) == nil
	status := http.StatusOK
	if !mongoOK || !redisOK {
		status = http.StatusServiceUnavailable
	}
	c.JSON(status, gin.H{"ok": mongoOK && redisOK, "mongo": mongoOK, "redis": redisOK})
}

type signupBody struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Server) signup(c *gin.Context) {
	var body signupBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request."})
		return
	}
	email, err := polls.NormalizeEmail(body.Email)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := polls.ValidatePassword(body.Password); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create account."})
		return
	}
	name := polls.NormalizeName(body.Name, email)
	u, err := s.Polls.CreateUser(c.Request.Context(), name, email, hash)
	if errors.Is(err, polls.ErrEmailTaken) {
		c.JSON(http.StatusConflict, gin.H{"error": "An account with that email already exists."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create account."})
		return
	}
	token, err := s.Auth.Sign(u.ID, u.Email, u.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not sign in."})
		return
	}
	s.Auth.SetCookie(c, token)
	c.JSON(http.StatusOK, gin.H{"id": u.ID, "email": u.Email, "name": u.Name})
}

func (s *Server) login(c *gin.Context) {
	var body signupBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request."})
		return
	}
	email, err := polls.NormalizeEmail(body.Email)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	u, err := s.Polls.UserByEmail(c.Request.Context(), email)
	if err != nil || auth.CheckPassword(u.PasswordHash, body.Password) != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Email or password is wrong."})
		return
	}
	token, err := s.Auth.Sign(u.ID, u.Email, u.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not sign in."})
		return
	}
	s.Auth.SetCookie(c, token)
	c.JSON(http.StatusOK, gin.H{"id": u.ID, "email": u.Email, "name": u.Name})
}

func (s *Server) logout(c *gin.Context) {
	s.Auth.ClearCookie(c)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) me(c *gin.Context) {
	u, err := s.Auth.FromRequest(c)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"user": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": gin.H{"id": u.ID, "email": u.Email, "name": u.Name}})
}

type createBody struct {
	Question       string   `json:"question"`
	Options        []string `json:"options"`
	HideUntilVoted bool     `json:"hideUntilVoted"`
	Slug           string   `json:"slug"`
}

func (s *Server) createPoll(c *gin.Context) {
	var body createBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request."})
		return
	}
	q, err := polls.NormalizeQuestion(body.Question)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	opts, err := polls.NormalizeOptions(body.Options)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var slug string
	if strings.TrimSpace(body.Slug) != "" {
		slug, err = polls.NormalizeSlug(body.Slug)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	u := auth.Current(c)
	view, err := s.Polls.CreatePoll(c.Request.Context(), u.ID, q, opts, body.HideUntilVoted, slug)
	if errors.Is(err, polls.ErrTaken) {
		c.JSON(http.StatusConflict, gin.H{"error": "That code is already taken."})
		return
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, view)
}

func (s *Server) listMine(c *gin.Context) {
	u := auth.Current(c)
	list, err := s.Polls.ListMine(c.Request.Context(), u.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load polls."})
		return
	}
	c.JSON(http.StatusOK, list)
}

func viewerID(c *gin.Context, a *auth.Service) string {
	if u, err := a.FromRequest(c); err == nil && u != nil {
		return u.ID
	}
	return ""
}

func (s *Server) getPoll(c *gin.Context) {
	slug := polls.SanitizeSlug(c.Param("slug"))
	token := strings.TrimSpace(c.Query("voter"))
	view, err := s.Polls.GetBySlug(c.Request.Context(), slug, token, viewerID(c, s.Auth))
	if errors.Is(err, polls.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load poll."})
		return
	}
	c.JSON(http.StatusOK, view)
}

type voteBody struct {
	OptionID   string `json:"optionId"`
	VoterToken string `json:"voterToken"`
}

func (s *Server) vote(c *gin.Context) {
	slug := polls.SanitizeSlug(c.Param("slug"))
	var body voteBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request."})
		return
	}
	view, err := s.Polls.Vote(c.Request.Context(), slug, strings.TrimSpace(body.OptionID), strings.TrimSpace(body.VoterToken))
	if errors.Is(err, polls.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found.", "code": "not_found"})
		return
	}
	if errors.Is(err, polls.ErrClosed) {
		c.JSON(http.StatusConflict, gin.H{"error": "This poll is closed.", "code": "closed"})
		return
	}
	if errors.Is(err, polls.ErrDuplicate) {
		existing, _ := s.Polls.GetBySlug(c.Request.Context(), slug, body.VoterToken, "")
		c.JSON(http.StatusConflict, gin.H{"error": "You already voted here.", "code": "duplicate", "poll": existing})
		return
	}
	if errors.Is(err, polls.ErrInvalid) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "That option is not on this poll.", "code": "invalid"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not record that vote."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "code": "ok", "poll": view})
}

func (s *Server) closePoll(c *gin.Context) {
	s.ownerMutate(c, s.Polls.Close)
}

func (s *Server) reopenPoll(c *gin.Context) {
	s.ownerMutate(c, s.Polls.Reopen)
}

func (s *Server) ownerMutate(c *gin.Context, fn func(context.Context, string, string) (*polls.PollView, error)) {
	slug := polls.SanitizeSlug(c.Param("slug"))
	u := auth.Current(c)
	view, err := fn(c.Request.Context(), slug, u.ID)
	if errors.Is(err, polls.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, view)
}

type renameBody struct {
	NextSlug string `json:"nextSlug"`
}

func (s *Server) renamePoll(c *gin.Context) {
	slug := polls.SanitizeSlug(c.Param("slug"))
	var body renameBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request."})
		return
	}
	next, err := polls.NormalizeSlug(body.NextSlug)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	u := auth.Current(c)
	view, err := s.Polls.Rename(c.Request.Context(), slug, next, u.ID)
	if errors.Is(err, polls.ErrTaken) {
		c.JSON(http.StatusConflict, gin.H{"error": "That code is already taken."})
		return
	}
	if errors.Is(err, polls.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update the link."})
		return
	}
	c.JSON(http.StatusOK, view)
}

func (s *Server) deletePoll(c *gin.Context) {
	slug := polls.SanitizeSlug(c.Param("slug"))
	u := auth.Current(c)
	if err := s.Polls.Delete(c.Request.Context(), slug, u.ID); err != nil {
		if errors.Is(err, polls.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not delete that poll."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) streamPoll(c *gin.Context) {
	slug := polls.SanitizeSlug(c.Param("slug"))
	token := strings.TrimSpace(c.Query("voter"))
	ctx := c.Request.Context()

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)
	c.Writer.Flush()

	view, err := s.Polls.GetBySlug(ctx, slug, token, viewerID(c, s.Auth))
	if err == nil {
		b, _ := json.Marshal(view)
		_, _ = io.WriteString(c.Writer, "data: "+string(b)+"\n\n")
		c.Writer.Flush()
	}

	sub := s.Polls.Subscribe(ctx, slug)
	defer sub.Close()
	ch := sub.Channel()
	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeat.C:
			_, _ = io.WriteString(c.Writer, ": ping\n\n")
			c.Writer.Flush()
		case msg, ok := <-ch:
			if !ok {
				return
			}
			_, _ = io.WriteString(c.Writer, "data: "+msg.Payload+"\n\n")
			c.Writer.Flush()
		}
	}
}
