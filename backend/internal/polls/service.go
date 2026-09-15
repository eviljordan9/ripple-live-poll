package polls

import (
	"context"
	"errors"
	"sort"
	"time"

	"ripple/internal/store"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	ErrNotFound   = errors.New("not_found")
	ErrForbidden  = errors.New("forbidden")
	ErrClosed     = errors.New("closed")
	ErrDuplicate  = errors.New("duplicate")
	ErrInvalid    = errors.New("invalid")
	ErrTaken      = errors.New("taken")
	ErrEmailTaken = errors.New("email_taken")
)

type Service struct {
	Mongo *store.Mongo
	Live  *store.Realtime
}

func (s *Service) CreateUser(ctx context.Context, name, email, passwordHash string) (*User, error) {
	u := &User{
		ID:           uuid.NewString(),
		Name:         name,
		Email:        email,
		PasswordHash: passwordHash,
		CreatedAt:    time.Now().UTC(),
	}
	_, err := s.Mongo.Users.InsertOne(ctx, u)
	if mongo.IsDuplicateKeyError(err) {
		return nil, ErrEmailTaken
	}
	return u, err
}

func (s *Service) UserByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	err := s.Mongo.Users.FindOne(ctx, bson.M{"email": email}).Decode(&u)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	return &u, err
}

func (s *Service) uniqueSlug(ctx context.Context, preferred string) (string, error) {
	if preferred != "" {
		n, err := s.Mongo.Polls.CountDocuments(ctx, bson.M{"slug": preferred})
		if err != nil {
			return "", err
		}
		if n > 0 {
			return "", ErrTaken
		}
		return preferred, nil
	}
	for i := 0; i < 8; i++ {
		slug := MakeSlug()
		n, err := s.Mongo.Polls.CountDocuments(ctx, bson.M{"slug": slug})
		if err != nil {
			return "", err
		}
		if n == 0 {
			return slug, nil
		}
	}
	return "", errors.New("Could not mint a unique code. Try again.")
}

func (s *Service) CreatePoll(ctx context.Context, userID, question string, options []string, hide bool, slugIn string) (*PollView, error) {
	slug, err := s.uniqueSlug(ctx, slugIn)
	if err != nil {
		return nil, err
	}
	opts := make([]Option, len(options))
	for i, label := range options {
		opts[i] = Option{ID: uuid.NewString(), Label: label, SortOrder: i}
	}
	p := Poll{
		ID:             uuid.NewString(),
		UserID:         userID,
		Slug:           slug,
		Question:       question,
		Status:         "open",
		HideUntilVoted: hide,
		Options:        opts,
		CreatedAt:      time.Now().UTC(),
	}
	if _, err := s.Mongo.Polls.InsertOne(ctx, p); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, ErrTaken
		}
		return nil, err
	}
	zero := map[string]int{}
	for _, o := range opts {
		zero[o.ID] = 0
	}
	_ = s.Live.SetCounts(ctx, p.ID, zero)
	view := s.assemble(p, zero, nil, userID)
	_ = s.Live.Publish(ctx, p.Slug, view)
	return view, nil
}

func (s *Service) GetBySlug(ctx context.Context, slug, voterToken, viewerID string) (*PollView, error) {
	var p Poll
	err := s.Mongo.Polls.FindOne(ctx, bson.M{"slug": slug}).Decode(&p)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	counts, err := s.counts(ctx, p)
	if err != nil {
		return nil, err
	}
	var voted *string
	if voterToken != "" {
		hash := HashVoter(voterToken)
		var v Vote
		err := s.Mongo.Votes.FindOne(ctx, bson.M{"pollId": p.ID, "voterHash": hash}).Decode(&v)
		if err == nil {
			voted = &v.OptionID
		}
	}
	return s.assemble(p, counts, voted, viewerID), nil
}

func (s *Service) ListMine(ctx context.Context, userID string) ([]PollSummary, error) {
	cur, err := s.Mongo.Polls.Find(ctx, bson.M{"userId": userID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var polls []Poll
	if err := cur.All(ctx, &polls); err != nil {
		return nil, err
	}
	out := make([]PollSummary, 0, len(polls))
	for _, p := range polls {
		counts, err := s.counts(ctx, p)
		if err != nil {
			return nil, err
		}
		total := 0
		for _, n := range counts {
			total += n
		}
		out = append(out, PollSummary{
			ID:          p.ID,
			Slug:        p.Slug,
			Question:    p.Question,
			Status:      p.Status,
			TotalVotes:  total,
			OptionCount: len(p.Options),
			CreatedAt:   p.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out, nil
}

func (s *Service) Vote(ctx context.Context, slug, optionID, voterToken string) (*PollView, error) {
	if len(voterToken) < 8 {
		return nil, ErrInvalid
	}
	var p Poll
	err := s.Mongo.Polls.FindOne(ctx, bson.M{"slug": slug}).Decode(&p)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if p.Status != "open" {
		return nil, ErrClosed
	}
	found := false
	for _, o := range p.Options {
		if o.ID == optionID {
			found = true
			break
		}
	}
	if !found {
		return nil, ErrInvalid
	}
	hash := HashVoter(voterToken)
	v := Vote{
		ID:        uuid.NewString(),
		PollID:    p.ID,
		OptionID:  optionID,
		VoterHash: hash,
		CreatedAt: time.Now().UTC(),
	}
	if _, err := s.Mongo.Votes.InsertOne(ctx, v); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, ErrDuplicate
		}
		return nil, err
	}
	// Redis is the live counter + fan-out. Mongo keeps the durable vote row.
	if _, err := s.Live.IncrOption(ctx, p.ID, optionID); err != nil {
		return nil, err
	}
	counts, err := s.counts(ctx, p)
	if err != nil {
		return nil, err
	}
	voted := optionID
	view := s.assemble(p, counts, &voted, "")
	_ = s.Live.Publish(ctx, p.Slug, view)
	return view, nil
}

func (s *Service) Close(ctx context.Context, slug, userID string) (*PollView, error) {
	now := time.Now().UTC()
	res := s.Mongo.Polls.FindOneAndUpdate(ctx,
		bson.M{"slug": slug, "userId": userID},
		bson.M{"$set": bson.M{"status": "closed", "closedAt": now}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	var p Poll
	if err := res.Decode(&p); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	counts, _ := s.counts(ctx, p)
	view := s.assemble(p, counts, nil, userID)
	_ = s.Live.Publish(ctx, p.Slug, view)
	return view, nil
}

func (s *Service) Reopen(ctx context.Context, slug, userID string) (*PollView, error) {
	res := s.Mongo.Polls.FindOneAndUpdate(ctx,
		bson.M{"slug": slug, "userId": userID},
		bson.M{"$set": bson.M{"status": "open"}, "$unset": bson.M{"closedAt": ""}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	var p Poll
	if err := res.Decode(&p); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	counts, _ := s.counts(ctx, p)
	view := s.assemble(p, counts, nil, userID)
	_ = s.Live.Publish(ctx, p.Slug, view)
	return view, nil
}

func (s *Service) Rename(ctx context.Context, slug, next, userID string) (*PollView, error) {
	if slug == next {
		return s.GetBySlug(ctx, slug, "", userID)
	}
	n, err := s.Mongo.Polls.CountDocuments(ctx, bson.M{"slug": next})
	if err != nil {
		return nil, err
	}
	if n > 0 {
		return nil, ErrTaken
	}
	res := s.Mongo.Polls.FindOneAndUpdate(ctx,
		bson.M{"slug": slug, "userId": userID},
		bson.M{"$set": bson.M{"slug": next}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	var p Poll
	if err := res.Decode(&p); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	counts, _ := s.counts(ctx, p)
	view := s.assemble(p, counts, nil, userID)
	_ = s.Live.Publish(ctx, next, view)
	return view, nil
}

func (s *Service) Delete(ctx context.Context, slug, userID string) error {
	res, err := s.Mongo.Polls.DeleteOne(ctx, bson.M{"slug": slug, "userId": userID})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) Subscribe(ctx context.Context, slug string) *redis.PubSub {
	return s.Live.Subscribe(ctx, slug)
}

func (s *Service) SeedDemo(ctx context.Context) error {
	n, err := s.Mongo.Polls.CountDocuments(ctx, bson.M{"slug": "WELCOME"})
	if err != nil || n > 0 {
		return err
	}
	opts := []Option{
		{ID: "opt_demo_1", Label: "Lisbon", SortOrder: 0},
		{ID: "opt_demo_2", Label: "Kyoto", SortOrder: 1},
		{ID: "opt_demo_3", Label: "Reykjavik", SortOrder: 2},
		{ID: "opt_demo_4", Label: "Mexico City", SortOrder: 3},
	}
	p := Poll{
		ID:             "poll_demo",
		UserID:         "ripple-demo",
		Slug:           "WELCOME",
		Question:       "Where should we take the offsite?",
		Status:         "open",
		HideUntilVoted: false,
		Options:        opts,
		CreatedAt:      time.Now().UTC(),
	}
	if _, err := s.Mongo.Polls.InsertOne(ctx, p); err != nil && !mongo.IsDuplicateKeyError(err) {
		return err
	}
	return nil
}

func (s *Service) counts(ctx context.Context, p Poll) (map[string]int, error) {
	cached, err := s.Live.GetCounts(ctx, p.ID)
	if err == nil && len(cached) > 0 {
		return cached, nil
	}
	// Rebuild from Mongo (source of truth) then hydrate Redis.
	pipe := []bson.M{
		{"$match": bson.M{"pollId": p.ID}},
		{"$group": bson.M{"_id": "$optionId", "n": bson.M{"$sum": 1}}},
	}
	cur, err := s.Mongo.Votes.Aggregate(ctx, pipe)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := map[string]int{}
	for _, o := range p.Options {
		out[o.ID] = 0
	}
	var rows []struct {
		ID string `bson:"_id"`
		N  int    `bson:"n"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ID] = r.N
	}
	_ = s.Live.SetCounts(ctx, p.ID, out)
	return out, nil
}

func (s *Service) assemble(p Poll, counts map[string]int, voted *string, viewerID string) *PollView {
	isOwner := viewerID != "" && viewerID == p.UserID
	total := 0
	for _, n := range counts {
		total += n
	}
	visible := isOwner || !p.HideUntilVoted || voted != nil || p.Status == "closed"
	opts := append([]Option(nil), p.Options...)
	sort.Slice(opts, func(i, j int) bool { return opts[i].SortOrder < opts[j].SortOrder })
	views := make([]OptionView, len(opts))
	for i, o := range opts {
		votes := 0
		pct := 0
		if visible {
			votes = counts[o.ID]
			if total > 0 {
				pct = int(float64(votes)/float64(total)*100 + 0.5)
			}
		}
		views[i] = OptionView{ID: o.ID, Label: o.Label, Votes: votes, Pct: pct}
	}
	shownTotal := 0
	if visible {
		shownTotal = total
	}
	return &PollView{
		ID:             p.ID,
		Slug:           p.Slug,
		Question:       p.Question,
		Status:         p.Status,
		HideUntilVoted: p.HideUntilVoted,
		CreatedAt:      p.CreatedAt.UTC().Format(time.RFC3339),
		TotalVotes:     shownTotal,
		Options:        views,
		VotedOptionID:  voted,
		ResultsVisible: visible,
		IsOwner:        isOwner,
	}
}

