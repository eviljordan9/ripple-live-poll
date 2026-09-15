package config

import "os"

type Config struct {
	HTTPAddr     string
	MongoURI     string
	MongoDB      string
	RedisAddr    string
	JWTSecret    string
	CookieName   string
	SecureCookie bool
}

func Load() Config {
	secret := getenv("JWT_SECRET", "ripple-dev-secret-change-in-production")
	return Config{
		HTTPAddr:     getenv("HTTP_ADDR", "127.0.0.1:8081"),
		MongoURI:     getenv("MONGO_URI", "mongodb://127.0.0.1:27017"),
		MongoDB:      getenv("MONGO_DB", "ripple"),
		RedisAddr:    getenv("REDIS_ADDR", "127.0.0.1:6379"),
		JWTSecret:    secret,
		CookieName:   "ripple_token",
		SecureCookie: getenv("COOKIE_SECURE", "") == "1",
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
