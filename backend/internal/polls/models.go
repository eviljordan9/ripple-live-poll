package polls

import "time"

type Option struct {
	ID        string `bson:"id" json:"id"`
	Label     string `bson:"label" json:"label"`
	SortOrder int    `bson:"sortOrder" json:"sortOrder"`
}

type Poll struct {
	ID             string    `bson:"_id" json:"id"`
	UserID         string    `bson:"userId" json:"userId"`
	Slug           string    `bson:"slug" json:"slug"`
	Question       string    `bson:"question" json:"question"`
	Status         string    `bson:"status" json:"status"`
	HideUntilVoted bool      `bson:"hideUntilVoted" json:"hideUntilVoted"`
	Options        []Option  `bson:"options" json:"options"`
	CreatedAt      time.Time `bson:"createdAt" json:"createdAt"`
	ClosedAt       *time.Time `bson:"closedAt,omitempty" json:"closedAt,omitempty"`
}

type Vote struct {
	ID        string    `bson:"_id" json:"id"`
	PollID    string    `bson:"pollId" json:"pollId"`
	OptionID  string    `bson:"optionId" json:"optionId"`
	VoterHash string    `bson:"voterHash" json:"voterHash"`
	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
}

type User struct {
	ID           string    `bson:"_id" json:"id"`
	Name         string    `bson:"name" json:"name"`
	Email        string    `bson:"email" json:"email"`
	PasswordHash string    `bson:"passwordHash" json:"-"`
	CreatedAt    time.Time `bson:"createdAt" json:"createdAt"`
}

type OptionView struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Votes int    `json:"votes"`
	Pct   int    `json:"pct"`
}

type PollView struct {
	ID             string       `json:"id"`
	Slug           string       `json:"slug"`
	Question       string       `json:"question"`
	Status         string       `json:"status"`
	HideUntilVoted bool         `json:"hideUntilVoted"`
	CreatedAt      string       `json:"createdAt"`
	TotalVotes     int          `json:"totalVotes"`
	Options        []OptionView `json:"options"`
	VotedOptionID  *string      `json:"votedOptionId"`
	ResultsVisible bool         `json:"resultsVisible"`
	IsOwner        bool         `json:"isOwner"`
}

type PollSummary struct {
	ID          string `json:"id"`
	Slug        string `json:"slug"`
	Question    string `json:"question"`
	Status      string `json:"status"`
	TotalVotes  int    `json:"totalVotes"`
	OptionCount int    `json:"optionCount"`
	CreatedAt   string `json:"createdAt"`
}
