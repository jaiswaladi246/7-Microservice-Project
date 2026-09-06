package com.devopsshack.auth;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@CrossOrigin(origins="*")
public class AuthController {
  private final JdbcTemplate jdbc;
  private final BCryptPasswordEncoder encoder;

  public AuthController(JdbcTemplate jdbc, BCryptPasswordEncoder encoder) {
    this.jdbc = jdbc;
    this.encoder = encoder;
  }

  @GetMapping("/health")
  public Map<String,Object> health() {
    return Map.of("service","auth-service","status","UP","language","Java");
  }

  @PostMapping("/auth/register")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String,Object> register(@RequestBody RegisterRequest req) {
    if (req.name()==null || req.name().isBlank() || req.email()==null || req.email().isBlank()
        || req.password()==null || req.password().length()<6) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name, email and password (min 6 chars) are required");
    }

    Integer exists = jdbc.queryForObject(
      "SELECT COUNT(*) FROM app_users WHERE lower(email)=lower(?)",
      Integer.class, req.email().trim()
    );
    if (exists != null && exists > 0) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "email already registered");
    }

    Long id = jdbc.queryForObject(
      "INSERT INTO app_users(name,email,password_hash,role) VALUES(?,?,?,'USER') RETURNING id",
      Long.class,
      req.name().trim(),
      req.email().trim().toLowerCase(),
      encoder.encode(req.password())
    );

    return Map.of("id",id,"name",req.name().trim(),"email",req.email().trim().toLowerCase(),"role","USER");
  }

  @PostMapping("/auth/login")
  public Map<String,Object> login(@RequestBody LoginRequest req) {
    String email = req.email()==null ? "" : req.email().trim();
    List<Map<String,Object>> users = jdbc.queryForList(
      "SELECT id,name,email,password_hash,role FROM app_users WHERE lower(email)=lower(?)", email
    );
    if (users.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid credentials");
    }
    Map<String,Object> user = users.get(0);
    String supplied = req.password()==null ? "" : req.password();
    if (!encoder.matches(supplied, (String)user.get("password_hash"))) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid credentials");
    }

    String token = UUID.randomUUID().toString();
    jdbc.update(
      "INSERT INTO user_sessions(token,user_id,expires_at) VALUES(?,?,?)",
      token,
      ((Number)user.get("id")).longValue(),
      Timestamp.from(Instant.now().plus(12, ChronoUnit.HOURS))
    );

    return Map.of(
      "token", token,
      "user", Map.of(
        "id",user.get("id"),
        "name",user.get("name"),
        "email",user.get("email"),
        "role",user.get("role")
      )
    );
  }

  @GetMapping("/auth/me")
  public Map<String,Object> me(@RequestParam String token) {
    List<Map<String,Object>> rows = jdbc.queryForList("""
      SELECT u.id,u.name,u.email,u.role,s.expires_at
      FROM user_sessions s
      JOIN app_users u ON u.id=s.user_id
      WHERE s.token=? AND s.expires_at > NOW()
    """, token);
    if (rows.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid or expired session");
    }
    return rows.get(0);
  }

  public record RegisterRequest(String name, String email, String password) {}
  public record LoginRequest(String email, String password) {}
}
