require "sinatra"
require "json"
require "pg"

set :bind, "0.0.0.0"
set :port, 8086
set :server, :puma

DB_URL = ENV.fetch(
  "NOTIFICATION_DB_URL",
  "postgres://microapp:microapp123@127.0.0.1:5432/notification_db"
)

def db
  PG.connect(DB_URL)
end

connection = db
connection.exec <<~SQL
  CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    recipient VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
SQL

count = connection.exec("SELECT COUNT(*) AS count FROM notifications")[0]["count"].to_i
if count.zero?
  connection.exec_params(
    "INSERT INTO notifications(recipient,type,subject,message) VALUES($1,$2,$3,$4)",
    [
      "admin@devopsshack.com",
      "WELCOME",
      "Polyglot platform is ready",
      "Ruby Notification Service is ready to receive order and payment events."
    ]
  )
end
connection.close

before do
  content_type :json
  headers(
    "Access-Control-Allow-Origin" => "*",
    "Access-Control-Allow-Methods" => "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers" => "Content-Type,Authorization"
  )
end

options "*" do
  status 204
end

get "/health" do
  connection = db
  connection.exec("SELECT 1")
  connection.close
  { service: "notification-service", status: "UP", language: "Ruby" }.to_json
end

get "/notifications" do
  connection = db
  recipient = params["recipient"]
  result =
    if recipient && !recipient.strip.empty?
      connection.exec_params(
        "SELECT * FROM notifications WHERE lower(recipient)=lower($1) ORDER BY id DESC",
        [recipient]
      )
    else
      connection.exec("SELECT * FROM notifications ORDER BY id DESC")
    end

  rows = result.map do |row|
    {
      id: row["id"].to_i,
      recipient: row["recipient"],
      type: row["type"],
      subject: row["subject"],
      message: row["message"],
      is_read: row["is_read"] == "t",
      created_at: row["created_at"]
    }
  end
  connection.close
  rows.to_json
end

post "/notifications" do
  payload = JSON.parse(request.body.read)
  required = %w[recipient type subject message]
  missing = required.select { |k| payload[k].nil? || payload[k].to_s.strip.empty? }
  halt 400, { error: "missing fields: #{missing.join(', ')}" }.to_json unless missing.empty?

  connection = db
  result = connection.exec_params(
    "INSERT INTO notifications(recipient,type,subject,message) VALUES($1,$2,$3,$4) RETURNING *",
    [payload["recipient"], payload["type"], payload["subject"], payload["message"]]
  )
  row = result[0]
  connection.close
  status 201
  {
    id: row["id"].to_i,
    recipient: row["recipient"],
    type: row["type"],
    subject: row["subject"],
    message: row["message"],
    is_read: false,
    created_at: row["created_at"]
  }.to_json
rescue JSON::ParserError
  halt 400, { error: "invalid JSON" }.to_json
end

post "/notifications/:id/read" do
  connection = db
  result = connection.exec_params(
    "UPDATE notifications SET is_read=TRUE WHERE id=$1 RETURNING *",
    [params["id"]]
  )
  if result.ntuples.zero?
    connection.close
    halt 404, { error: "notification not found" }.to_json
  end
  row = result[0]
  connection.close
  {
    id: row["id"].to_i,
    recipient: row["recipient"],
    type: row["type"],
    subject: row["subject"],
    message: row["message"],
    is_read: true,
    created_at: row["created_at"]
  }.to_json
end
