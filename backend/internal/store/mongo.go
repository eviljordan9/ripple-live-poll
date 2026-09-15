package store

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Mongo struct {
	Client *mongo.Client
	DB     *mongo.Database
	Users  *mongo.Collection
	Polls  *mongo.Collection
	Votes  *mongo.Collection
}

func ConnectMongo(ctx context.Context, uri, dbName string) (*Mongo, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}
	db := client.Database(dbName)
	m := &Mongo{
		Client: client,
		DB:     db,
		Users:  db.Collection("users"),
		Polls:  db.Collection("polls"),
		Votes:  db.Collection("votes"),
	}
	if err := m.ensureIndexes(ctx); err != nil {
		return nil, err
	}
	return m, nil
}

func (m *Mongo) ensureIndexes(ctx context.Context) error {
	_, err := m.Users.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}
	_, err = m.Polls.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "slug", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}
	_, err = m.Polls.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "userId", Value: 1}, {Key: "createdAt", Value: -1}},
	})
	if err != nil {
		return err
	}
	_, err = m.Votes.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "pollId", Value: 1}, {Key: "voterHash", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	return err
}
