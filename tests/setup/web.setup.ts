import '@testing-library/jest-dom/vitest';
import React from 'react';

// Make React available globally for JSX in test files
// Components use 'use client' but test environment needs explicit React
globalThis.React = React;
