import { createApp } from 'vue'
import App from './App.vue'

/* import the fontawesome core */
import { library } from '@fortawesome/fontawesome-svg-core'

/* import font awesome icon component */
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

/* import specific icons */
import {
    faPlayCircle, faFolderOpen, faChevronLeft, faChevronRight, faChevronDown,
    faDownload, faVideo, faClosedCaptioning, faCopy, faArrowUp, faFileLines, faFile,
    faInfoCircle, faExclamationTriangle, faCircleXmark
} from '@fortawesome/free-solid-svg-icons' // Added faArrowUp, faFileLines, faFile

/* add icons to the library */
library.add(
    faPlayCircle, faFolderOpen, faChevronLeft, faChevronRight, faChevronDown,
    faDownload, faVideo, faClosedCaptioning, faCopy, faArrowUp, faFileLines, faFile,
    faInfoCircle, faExclamationTriangle, faCircleXmark
)

const app = createApp(App)
app.component('font-awesome-icon', FontAwesomeIcon)
app.mount('#app')