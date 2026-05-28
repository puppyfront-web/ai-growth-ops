# Interaction Sync Today Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter comment/message sync to only today's data, deduplicate results before and during persistence, and support task-level headed browser overrides for browser-assist collection.

**Architecture:** Add a small browser-runner helper for "today in Asia/Shanghai" filtering and stable deduplication, thread an optional `headed` flag from the UI through API → worker → connector → browser-runner, and add worker-side persistence guards so malformed or repeated upstream results never create duplicate or stale interactions.

**Tech Stack:** Next.js, Node HTTP API, BullMQ worker, Playwright browser-runner, Vitest

---
