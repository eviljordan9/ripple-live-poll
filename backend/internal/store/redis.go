package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// Realtime is the live path: vote counters live in a Redis hash and every
// change is PUBLISH'd so watchers get Server-Sent Events without polling.
type Realtime struct {
	RDB *redis.Client
}

func ConnectRedis(addr string) (*Realtime, error) {
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}
	return &Realtime{RDB: rdb}, nil
}

func countsKey(pollID string) string { return "poll:counts:" + pollID }
func liveChan(slug string) string    { return "poll:live:" + slug }

func (r *Realtime) IncrOption(ctx context.Context, pollID, optionID string) (int64, error) {
	return r.RDB.HIncrBy(ctx, countsKey(pollID), optionID, 1).Result()
}

func (r *Realtime) GetCounts(ctx context.Context, pollID string) (map[string]int, error) {
	raw, err := r.RDB.HGetAll(ctx, countsKey(pollID)).Result()
	if err != nil {
		return nil, err
	}
	out := make(map[string]int, len(raw))
	for k, v := range raw {
		n, _ := strconv.Atoi(v)
		out[k] = n
	}
	return out, nil
}

func (r *Realtime) SetCounts(ctx context.Context, pollID string, counts map[string]int) error {
	if len(counts) == 0 {
		return nil
	}
	fields := make([]any, 0, len(counts)*2)
	for id, n := range counts {
		fields = append(fields, id, n)
	}
	return r.RDB.HSet(ctx, countsKey(pollID), fields...).Err()
}

func (r *Realtime) Publish(ctx context.Context, slug string, payload any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return r.RDB.Publish(ctx, liveChan(slug), b).Err()
}

func (r *Realtime) Subscribe(ctx context.Context, slug string) *redis.PubSub {
	return r.RDB.Subscribe(ctx, liveChan(slug))
}

func OptionField(optionID string) string { return optionID }

func LiveChannel(slug string) string { return liveChan(slug) }

func (r *Realtime) Ping(ctx context.Context) error {
	return r.RDB.Ping(ctx).Err()
}

func CountsOrEmpty(m map[string]int) map[string]int {
	if m == nil {
		return map[string]int{}
	}
	return m
}

func FormatSSE(data []byte) string {
	return fmt.Sprintf("data: %s\n\n", data)
}
