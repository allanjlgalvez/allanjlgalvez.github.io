package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	cookieName = "nexus_s"
	sessionTTL = 30 * 24 * time.Hour
)

func randHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func passwordHash() (string, error) {
	var h string
	err := db.QueryRow("SELECT value FROM settings WHERE key='password'").Scan(&h)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return h, err
}

func setPassword(pw string) error {
	h, err := bcrypt.GenerateFromPassword([]byte(pw), 12)
	if err != nil {
		return err
	}
	_, err = db.Exec(`INSERT INTO settings(key,value) VALUES('password',?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value`, string(h))
	return err
}

func checkPassword(pw string) bool {
	h, err := passwordHash()
	if err != nil || h == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(h), []byte(pw)) == nil
}

func newSession(w http.ResponseWriter) error {
	tok := randHex(32)
	exp := time.Now().Add(sessionTTL)
	if _, err := db.Exec("INSERT INTO sessions(token,expires) VALUES(?,?)", tok, exp.Unix()); err != nil {
		return err
	}
	_, _ = db.Exec("DELETE FROM sessions WHERE expires < ?", time.Now().Unix())
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: tok, Path: "/", Expires: exp,
		HttpOnly: true, SameSite: http.SameSiteStrictMode,
	})
	return nil
}

func validSession(r *http.Request) bool {
	c, err := r.Cookie(cookieName)
	if err != nil || len(c.Value) != 64 {
		return false
	}
	var exp int64
	if err := db.QueryRow("SELECT expires FROM sessions WHERE token=?", c.Value).Scan(&exp); err != nil {
		return false
	}
	return exp > time.Now().Unix()
}

func endSession(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		_, _ = db.Exec("DELETE FROM sessions WHERE token=?", c.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
}

// Limitador simple de intentos de inicio de sesión por IP.
var (
	loginMu    sync.Mutex
	loginFails = map[string]*failInfo{}
)

type failInfo struct {
	count int
	until time.Time
}

func clientIP(r *http.Request) string {
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return h
}

func loginBlocked(ip string) time.Duration {
	loginMu.Lock()
	defer loginMu.Unlock()
	if f, ok := loginFails[ip]; ok && time.Now().Before(f.until) {
		return time.Until(f.until)
	}
	return 0
}

func loginFailed(ip string) {
	loginMu.Lock()
	defer loginMu.Unlock()
	f := loginFails[ip]
	if f == nil {
		f = &failInfo{}
		loginFails[ip] = f
	}
	f.count++
	if f.count >= 5 {
		f.until = time.Now().Add(time.Duration(f.count-4) * time.Minute)
	}
}

func loginOK(ip string) {
	loginMu.Lock()
	delete(loginFails, ip)
	loginMu.Unlock()
}
