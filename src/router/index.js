import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const history = window.location.protocol === 'file:'
  ? createWebHashHistory()
  : createWebHistory('/')

const router = createRouter({
  history,
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { pageClass: 'toolpath-editor-page' },
    },
  ],
})

// On first page load, check if we were redirected
router.isReady().then(() => {
  const redirectPath = sessionStorage.getItem('redirectPath')
  if (redirectPath) {
    sessionStorage.removeItem('redirectPath')
    if (redirectPath !== window.location.pathname) {
      router.replace(redirectPath)
    }
  }
})

export default router
