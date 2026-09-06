package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	_ "github.com/lib/pq"
)

type Product struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	Category    string  `json:"category"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
	Image       string  `json:"image"`
	Active      bool    `json:"active"`
}

var db *sql.DB

func main() {
	dsn := getenv("CATALOG_DB_DSN", "postgres://microapp:microapp123@127.0.0.1:5432/catalog_db?sslmode=disable")
	var err error
	db, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatal(err)
	}
	if err = db.Ping(); err != nil {
		log.Fatal(err)
	}

	migrate()
	seed()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", health)
	mux.HandleFunc("/products", products)
	mux.HandleFunc("/products/", productByID)

	log.Println("catalog-service listening on http://localhost:8082")
	log.Fatal(http.ListenAndServe(":8082", cors(mux)))
}

func getenv(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

func migrate() {
	_, err := db.Exec(`
    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      category VARCHAR(100) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price NUMERIC(12,2) NOT NULL CHECK(price>=0),
      image TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
	if err != nil {
		log.Fatal(err)
	}
}

func seed() {
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM products").Scan(&count); err != nil {
		log.Fatal(err)
	}
	if count > 0 {
		return
	}
	seed := []Product{
		{Name: "AI Mechanical Keyboard", Category: "Workspace", Description: "Low-profile mechanical keyboard designed for coding sessions.", Price: 79.99, Image: "⌨️", Active: true},
		{Name: "CloudOps Headset", Category: "Audio", Description: "Comfortable USB headset for standups and incident calls.", Price: 64.50, Image: "🎧", Active: true},
		{Name: "Kubernetes Desk Mat", Category: "Workspace", Description: "Large desk mat with Kubernetes command references.", Price: 29.00, Image: "☸️", Active: true},
		{Name: "DevSecOps Security Key", Category: "Security", Description: "Hardware security-key demo product for MFA workflows.", Price: 49.99, Image: "🔐", Active: true},
		{Name: "Observability Display", Category: "Hardware", Description: "Portable display for metrics and dashboards.", Price: 189.00, Image: "📊", Active: true},
		{Name: "SRE Incident Notebook", Category: "Learning", Description: "Structured notebook for runbooks, incidents and postmortems.", Price: 18.75, Image: "📘", Active: true},
	}
	for _, p := range seed {
		_, err := db.Exec(
			"INSERT INTO products(name,category,description,price,image,active) VALUES($1,$2,$3,$4,$5,$6)",
			p.Name, p.Category, p.Description, p.Price, p.Image, p.Active,
		)
		if err != nil {
			log.Fatal(err)
		}
	}
}

func health(w http.ResponseWriter, r *http.Request) {
	jsonOut(w, 200, map[string]any{"service": "catalog-service", "status": "UP", "language": "Go"})
}

func products(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		query := "SELECT id,name,category,description,price,image,active FROM products"
		args := []any{}
		if q != "" {
			query += " WHERE lower(name) LIKE lower($1) OR lower(category) LIKE lower($1) OR lower(description) LIKE lower($1)"
			args = append(args, "%"+q+"%")
		}
		query += " ORDER BY id"
		rows, err := db.Query(query, args...)
		if err != nil {
			jsonOut(w, 500, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()
		result := []Product{}
		for rows.Next() {
			var p Product
			if err := rows.Scan(&p.ID, &p.Name, &p.Category, &p.Description, &p.Price, &p.Image, &p.Active); err != nil {
				jsonOut(w, 500, map[string]string{"error": err.Error()})
				return
			}
			result = append(result, p)
		}
		jsonOut(w, 200, result)

	case http.MethodPost:
		var p Product
		if json.NewDecoder(r.Body).Decode(&p) != nil {
			jsonOut(w, 400, map[string]string{"error": "invalid JSON"})
			return
		}
		if strings.TrimSpace(p.Name) == "" || strings.TrimSpace(p.Category) == "" || p.Price < 0 {
			jsonOut(w, 400, map[string]string{"error": "name, category and non-negative price are required"})
			return
		}
		if p.Image == "" {
			p.Image = "📦"
		}
		p.Active = true
		err := db.QueryRow(
			"INSERT INTO products(name,category,description,price,image,active) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
			p.Name, p.Category, p.Description, p.Price, p.Image, p.Active,
		).Scan(&p.ID)
		if err != nil {
			jsonOut(w, 500, map[string]string{"error": err.Error()})
			return
		}
		jsonOut(w, 201, p)

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func productByID(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(strings.TrimPrefix(r.URL.Path, "/products/"), 10, 64)
	if err != nil {
		jsonOut(w, 400, map[string]string{"error": "invalid product id"})
		return
	}

	switch r.Method {
	case http.MethodGet:
		var p Product
		err := db.QueryRow(
			"SELECT id,name,category,description,price,image,active FROM products WHERE id=$1", id,
		).Scan(&p.ID, &p.Name, &p.Category, &p.Description, &p.Price, &p.Image, &p.Active)
		if err == sql.ErrNoRows {
			jsonOut(w, 404, map[string]string{"error": "product not found"})
			return
		}
		if err != nil {
			jsonOut(w, 500, map[string]string{"error": err.Error()})
			return
		}
		jsonOut(w, 200, p)

	case http.MethodPut:
		var p Product
		if json.NewDecoder(r.Body).Decode(&p) != nil {
			jsonOut(w, 400, map[string]string{"error": "invalid JSON"})
			return
		}
		if p.Image == "" {
			p.Image = "📦"
		}
		result, err := db.Exec(
			"UPDATE products SET name=$1,category=$2,description=$3,price=$4,image=$5,active=$6 WHERE id=$7",
			p.Name, p.Category, p.Description, p.Price, p.Image, p.Active, id,
		)
		if err != nil {
			jsonOut(w, 500, map[string]string{"error": err.Error()})
			return
		}
		n, _ := result.RowsAffected()
		if n == 0 {
			jsonOut(w, 404, map[string]string{"error": "product not found"})
			return
		}
		p.ID = id
		jsonOut(w, 200, p)

	case http.MethodDelete:
		result, err := db.Exec("DELETE FROM products WHERE id=$1", id)
		if err != nil {
			jsonOut(w, 500, map[string]string{"error": err.Error()})
			return
		}
		n, _ := result.RowsAffected()
		if n == 0 {
			jsonOut(w, 404, map[string]string{"error": "product not found"})
			return
		}
		w.WriteHeader(204)

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func jsonOut(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}
