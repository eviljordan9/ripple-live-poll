package polls

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
	"unicode"
)

const (
	SlugMin = 3
	SlugMax = 16
)

var slugRe = regexp.MustCompile(`^[A-Z0-9]{3,16}$`)

var slugAlphabet = []byte("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")

func NormalizeQuestion(raw string) (string, error) {
	q := strings.Join(strings.Fields(strings.TrimSpace(raw)), " ")
	if len(q) < 3 {
		return "", errors.New("Question must be at least 3 characters.")
	}
	if len(q) > 160 {
		return "", errors.New("Question must be 160 characters or fewer.")
	}
	return q, nil
}

func NormalizeOptions(raw []string) ([]string, error) {
	cleaned := make([]string, 0, len(raw))
	seen := map[string]struct{}{}
	for _, o := range raw {
		label := strings.Join(strings.Fields(strings.TrimSpace(o)), " ")
		if label == "" {
			continue
		}
		if len(label) > 60 {
			return nil, errors.New("Each option must be 60 characters or fewer.")
		}
		key := strings.ToLower(label)
		if _, ok := seen[key]; ok {
			return nil, errors.New("Options must be unique.")
		}
		seen[key] = struct{}{}
		cleaned = append(cleaned, label)
	}
	if len(cleaned) < 2 {
		return nil, errors.New("Add at least two options.")
	}
	if len(cleaned) > 8 {
		return nil, errors.New("Eight options is the maximum.")
	}
	return cleaned, nil
}

func SanitizeSlug(raw string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(raw) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
		if b.Len() >= SlugMax {
			break
		}
	}
	return b.String()
}

func NormalizeSlug(raw string) (string, error) {
	s := SanitizeSlug(raw)
	if !slugRe.MatchString(s) {
		return "", errors.New("Code must be 3–16 letters or numbers.")
	}
	return s, nil
}

func MakeSlug() string {
	buf := make([]byte, 6)
	_, _ = rand.Read(buf)
	out := make([]byte, 6)
	for i := range buf {
		out[i] = slugAlphabet[int(buf[i])%len(slugAlphabet)]
	}
	return string(out)
}

func HashVoter(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func NormalizeEmail(raw string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(raw))
	if email == "" || !strings.Contains(email, "@") || len(email) > 120 {
		return "", errors.New("Enter a valid email.")
	}
	return email, nil
}

func NormalizeName(raw, email string) string {
	name := strings.Join(strings.Fields(strings.TrimSpace(raw)), " ")
	if name == "" {
		if i := strings.Index(email, "@"); i > 0 {
			return email[:i]
		}
		return "Host"
	}
	if len(name) > 60 {
		return name[:60]
	}
	return name
}

func ValidatePassword(pw string) error {
	if len(pw) < 8 {
		return errors.New("Password must be at least 8 characters.")
	}
	if len(pw) > 72 {
		return errors.New("Password is too long.")
	}
	return nil
}
