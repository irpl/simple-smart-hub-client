const { execSync } = require('child_process');
const pkg = require('./package.json');

let gitSha = '';
try {
  gitSha = execSync('git rev-parse --short HEAD', {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
} catch {
  gitSha = '';
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
};

module.exports = nextConfig;
