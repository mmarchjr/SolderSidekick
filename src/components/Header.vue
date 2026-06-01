
<template>
     
  
  <header class="navbar navbar-expand-lg navbar-dark bg-dark">
      <div class="container-fluid">
        <a class="navbar-brand d-flex align-items-center logo" href="#">
          <span style="color:white;font-size:1.5rem;font-weight:700">Toolpath Editor</span>
        </a>

        <!-- Toolpath Editor UI -->

        <UploadDrillFile @openZip="handleZipFile" />
        <button v-if="drillStore.pcbs.length > 0" class="btn btn-outline-light btn-sm nav-link" @click="saveProject">
            <i class="fa-solid fa-file-arrow-down"></i> Save Project
        </button>

        <button class="btn btn-outline-light btn-sm nav-link" data-bs-toggle="modal" data-bs-target="#machineConfigModal">
            <i class="fa-solid fa-gears me-1"></i> Advanced Settings
        </button>

        <!-- Navigation -->
        <button
          class="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
          aria-controls="navbarNav"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span class="navbar-toggler-icon"></span>
        </button>
  
        <div class="collapse navbar-collapse justify-content-end" id="navbarNav">
          <ul class="navbar-nav">

          </ul>
        </div>
      </div>
    </header>

    <ImportWizard ref="importWizardRef" />
  
  </template>
  
  <script setup>
import { ref } from "vue";
  import { useDrillStore } from "@/stores/store";
  import UploadDrillFile from "@/components/UploadDrillFile.vue";
  import ImportWizard from "@/components/ImportWizard.vue";
  import { useFileHandlers } from "@/composables/useFileHandlers";
  const { saveProject } = useFileHandlers();

  

const drillStore = useDrillStore();
const importWizardRef = ref(null);

const handleZipFile = (file) => {
  if (importWizardRef.value) {
    importWizardRef.value.openZipFile(file);
  }
};
  
  

  </script>
  
  
  <style scoped>
  .nav-link {
    height: 60px !important;
    font-size: 1.25rem !important;
    padding: 0rem 1rem !important;
  }
  
  .donate-button {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 5px 12px;
    white-space: nowrap;
  }
  
  .logo {
    margin-left: 1.5rem;
  }

  </style>
  
  