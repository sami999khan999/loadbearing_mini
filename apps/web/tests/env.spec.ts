import { describe, expect, it } from "vitest";
import { Env } from "../src/env.js";

// The shape of a real environment, as `vitest.config.ts` sets it: the cross-field rules
// run only once every field parses, so each case starts from a whole one.
const BASE = {
  DATABASE_URL: "postgres://test:test@localhost:15432/test",
  REDIS_CACHE_URL: "redis://localhost:16379",
  REDIS_QUEUE_URL: "redis://localhost:16380",
  S3_ENDPOINT: "http://localhost:19000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "test",
  S3_ACCESS_KEY: "test",
  S3_SECRET_KEY: "testsecret",
  SMTP_URL: "smtp://localhost:11025",
  EMAIL_FROM: "Test <no-reply@localhost>",
  APP_BASE_URL: "http://localhost:13000",
  AUTH_SECRET: "test-secret-test-secret-test-secret-32",
  AUTH_TRUSTED_ORIGINS: "http://localhost:13000",
  AUTH_SESSION_MAX_AGE_SECONDS: "604800",
  AUTH_COOKIE_CACHE_MAX_AGE_SECONDS: "60",
  EMBEDDING_MODEL: "text-embedding-3-small",
  EMBEDDING_DIMENSIONS: "1536",
};

const refusesAuthUrl = (AUTH_URL: string, NODE_ENV: string) => {
  const result = Env.schema.safeParse({ ...BASE, AUTH_URL, NODE_ENV });
  return (result.error?.issues ?? []).some((issue) => issue.path.join(".") === "AUTH_URL");
};

// `FC.15`. On http the session cookie is not `Secure`, and production booted anyway.
describe("Env", () => {
  it("refuses an http AUTH_URL in production", () => {
    expect(refusesAuthUrl("http://app.example", "production")).toBe(true);
  });

  it("allows https in production, and http on a loopback host or outside production", () => {
    expect(refusesAuthUrl("https://app.example", "production")).toBe(false);
    expect(refusesAuthUrl("http://localhost:13000", "production")).toBe(false);
    expect(refusesAuthUrl("http://app.example", "development")).toBe(false);
  });
});
