import { defineConfig } from 'electron-vite'
export default {
  main: {
    // vite config options
    build.lib.entry = 'electron/main.js'
  },
  preload: {
    // vite config options
  },
  renderer: {
    // vite config options
  }
}