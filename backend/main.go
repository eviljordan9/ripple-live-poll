package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ripple/internal/auth"
	"ripple/internal/config"
	"ripple/internal/httpapi"
	"ripple/internal/polls"
	"ripple/internal/store"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	mongo, err := store.ConnectMongo(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		log.Fatalf("mongo: %v", err)
	}
	live, err := store.ConnectRedis(cfg.RedisAddr)
	if err != nil {
		log.Fatalf("redis: %v", err)
	}

	svc := &polls.Service{Mongo: mongo, Live: live}
	if err := svc.SeedDemo(ctx); err != nil {
		log.Printf("demo seed: %v", err)
	}

	authSvc := auth.New(cfg.JWTSecret, cfg.CookieName, cfg.SecureCookie)
	engine := httpapi.New(authSvc, svc, live, mongo)

	srv := &http.Server{Addr: cfg.HTTPAddr, Handler: engine}
	go func() {
		log.Printf("ripple api on %s", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shut, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shut)
}
