package auth

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type Service struct {
	secret     []byte
	cookieName string
	secure     bool
}

func New(secret, cookieName string, secure bool) *Service {
	return &Service{secret: []byte(secret), cookieName: cookieName, secure: secure}
}

func HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, pw string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw))
}

func (s *Service) Sign(userID, email, name string) (string, error) {
	claims := jwt.MapClaims{
		"sub":   userID,
		"email": email,
		"name":  name,
		"exp":   time.Now().Add(30 * 24 * time.Hour).Unix(),
		"iat":   time.Now().Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString(s.secret)
}

func (s *Service) Parse(token string) (userID, email, name string, err error) {
	parsed, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return s.secret, nil
	})
	if err != nil || !parsed.Valid {
		return "", "", "", errors.New("invalid token")
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return "", "", "", errors.New("invalid token")
	}
	userID, _ = claims["sub"].(string)
	email, _ = claims["email"].(string)
	name, _ = claims["name"].(string)
	if userID == "" {
		return "", "", "", errors.New("invalid token")
	}
	return userID, email, name, nil
}

func (s *Service) SetCookie(c *gin.Context, token string) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     s.cookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   30 * 24 * 3600,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.secure,
	})
}

func (s *Service) ClearCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     s.cookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.secure,
	})
}

type User struct {
	ID    string
	Email string
	Name  string
}

func (s *Service) FromRequest(c *gin.Context) (*User, error) {
	token := ""
	if ck, err := c.Cookie(s.cookieName); err == nil {
		token = ck
	}
	if token == "" {
		h := c.GetHeader("Authorization")
		if strings.HasPrefix(h, "Bearer ") {
			token = strings.TrimPrefix(h, "Bearer ")
		}
	}
	if token == "" {
		return nil, errors.New("unauthorized")
	}
	id, email, name, err := s.Parse(token)
	if err != nil {
		return nil, err
	}
	return &User{ID: id, Email: email, Name: name}, nil
}

func (s *Service) Require() gin.HandlerFunc {
	return func(c *gin.Context) {
		u, err := s.FromRequest(c)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Sign in to continue."})
			return
		}
		c.Set("user", u)
		c.Next()
	}
}

func Current(c *gin.Context) *User {
	v, ok := c.Get("user")
	if !ok {
		return nil
	}
	u, _ := v.(*User)
	return u
}
