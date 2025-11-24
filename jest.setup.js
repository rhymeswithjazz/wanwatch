// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Polyfill Web APIs for Next.js API route testing
import { TextEncoder, TextDecoder } from 'util'
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Simple Response mock for API route testing
class MockResponse {
  constructor(body, init = {}) {
    this._body = body
    this.status = init.status || 200
    this.statusText = init.statusText || ''
    this.headers = new Map(Object.entries(init.headers || {}))
    this.ok = this.status >= 200 && this.status < 300
  }

  async json() {
    return JSON.parse(this._body)
  }

  async text() {
    return this._body
  }

  get(name) {
    return this.headers.get(name)
  }
}

// Add headers.get method for test access
MockResponse.prototype.headers = {
  get: function() { return null }
}

global.Response = MockResponse
global.Headers = Map

// Mock environment variables for tests
process.env.DATABASE_URL = 'file:./test.db'
process.env.NEXTAUTH_SECRET = 'test-secret-key-minimum-32-characters-long'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.NODE_ENV = 'test'
