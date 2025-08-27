#!/usr/bin/env node

// CommonJS launcher that dynamically imports the ESM build
import('../dist/index.js').catch((err) => {
    console.error(err)
    process.exit(1)
})
