package com.devopsshack.auth;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

@SpringBootApplication
public class AuthApplication {
  public static void main(String[] args) {
    SpringApplication.run(AuthApplication.class, args);
  }

  @Bean
  BCryptPasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  CommandLineRunner init(JdbcTemplate jdbc, BCryptPasswordEncoder encoder) {
    return args -> {
      jdbc.execute("""
        CREATE TABLE IF NOT EXISTS app_users (
          id BIGSERIAL PRIMARY KEY,
          name VARCHAR(120) NOT NULL,
          email VARCHAR(200) UNIQUE NOT NULL,
          password_hash VARCHAR(200) NOT NULL,
          role VARCHAR(40) NOT NULL DEFAULT 'USER',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      """);
      jdbc.execute("""
        CREATE TABLE IF NOT EXISTS user_sessions (
          token VARCHAR(100) PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        )
      """);
      Integer count = jdbc.queryForObject(
        "SELECT COUNT(*) FROM app_users WHERE email=?",
        Integer.class,
        "admin@devopsshack.com"
      );
      if (count != null && count == 0) {
        jdbc.update(
          "INSERT INTO app_users(name,email,password_hash,role) VALUES(?,?,?,?)",
          "DevOps Shack Admin",
          "admin@devopsshack.com",
          encoder.encode("admin123"),
          "ADMIN"
        );
      }
    };
  }
}
