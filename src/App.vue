
<template>
  <div class="app-root">

    <div v-if="isMobile && route.meta.pageClass == 'toolpath-editor-page'" class="mobile-message">

<!-- Bottom section -->
<div class="mobile-actions">
  <button class="btn btn-outline-light share-btn" @click="handleShare">
    <i class="fas fa-share-alt me-2"></i> Share or Send to Yourself
  </button>


</div>

</div>





  <div v-else :class="routeClass">
   
    <RouterView />

    
  </div>




</div>

</template>

<script setup>
import { useRoute } from 'vue-router'
import { ref, onMounted, computed } from "vue";
import { useDrillStore } from '@/stores/store'

const isMobile = ref(false)
const route = useRoute();

// Dynamically get route class from meta
const routeClass = computed(() => route.meta.pageClass || '');

const handleShare = async () => {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'PCB Soldering Toolpath Editor',
        text: 'PCB soldering toolpath editor for Ender 3 printers.',
        url: window.location.href
      });
    } catch (err) {
      console.log('Share cancelled or failed:', err);
    }
  } else {
    alert('Sharing not supported on this device.');
  }
};


onMounted(() => {
  isMobile.value = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

  const drillStore = useDrillStore()
  drillStore.initProfiles()
  
});




</script>


<style scoped>
.nav-link {
  height: 60px !important;
  font-size: 1.25rem !important;
  padding: 0rem 1rem !important;
}


</style>

<style>

/* General resets remain global */
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
}

/* Route-specific page layouts */
.toolpath-editor-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.getting-started-page {
  padding: 0; /* remove all padding to allow child to be 100% wide */
  background: #f9f9f9;
  overflow-y: auto;
  height: 100vh;
}




.mobile-message {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  min-height: 100vh;
  padding: 1vh 0rem 1rem;
  text-align: center;
  background-color: var(--bs-dark);
  color: var(--bs-light);
}

.mobile-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}


.mobile-text {
  font-size: 1.1rem;
  max-width: 500px;
  line-height: 1.6;
  margin-bottom: 1rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}

.video-wrapper {
  width: 100%;
  /* max-width: 640px; */
  aspect-ratio: 16 / 9;
  margin-bottom: 1rem;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #555;
}

.video-wrapper iframe {
  width: 100%;
  height: 100%;
}

.mobile-note {
  font-size: 1rem;
  color: #ccc;
  max-width: 500px;
  padding-left: 1rem;
  padding-right: 1rem;
}

.mobile-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: auto;
  gap: 0.75rem;
  width: 100%;
  padding-top: 1rem;
}

.share-btn {
  min-width: 240px;
  padding: 0.6rem 0.8rem;
  font-size: 1rem;
  font-weight: 600;
  flex-shrink: 0; /* prevents squishing on small screens */
}


</style>

