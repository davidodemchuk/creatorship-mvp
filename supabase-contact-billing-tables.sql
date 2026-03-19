-- Run this in Supabase SQL Editor to create tables for contact form and billing.
CREATE TABLE IF NOT EXISTS contact_messages (id text PRIMARY KEY, data jsonb NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS billing (id text PRIMARY KEY, brand_id text, data jsonb NOT NULL DEFAULT '{}');
