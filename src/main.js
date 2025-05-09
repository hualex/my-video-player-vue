import { createApp } from 'vue'
import App from './App.vue'

/* import the fontawesome core */
import { library } from '@fortawesome/fontawesome-svg-core'

/* import font awesome icon component */
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

/* import specific icons from free-solid-svg-icons */
import {
    faPlayCircle,       // For Load Media button
    faFolderOpen,       // For Get List button and directory icon
    faChevronLeft,      // For Collapse panel button
    faChevronRight,     // For Uncollapse panel button (large screen)
    faChevronDown,      // For Uncollapse panel button (small screen)
    faDownload,         // For Context menu download
    faVideo,            // For Context menu fill video / File list video icon
    faClosedCaptioning, // For Context menu fill subtitle
    faCopy,             // For Context menu copy URL
    faArrowUp,          // For File list parent directory
    faFileLines,        // For File list subtitle icon (was faFileAlt)
    faFile,             // For File list generic file icon
    faFileVideo,        // Alternative for file list video icon if preferred
    faInfoCircle,       // For Status message info
    faExclamationTriangle,// For Status message warning
    faCircleXmark,      // For Status message error
    faSpinner           // For Loading placeholder
} from '@fortawesome/free-solid-svg-icons'

/* add icons to the library */
library.add(
    faPlayCircle,
    faFolderOpen,
    faChevronLeft,
    faChevronRight,
    faChevronDown,
    faDownload,
    faVideo,            // Using faVideo for video files
    faClosedCaptioning,
    faCopy,
    faArrowUp,
    faFileLines,
    faFile,
    faFileVideo,        // Also add faFileVideo if you might switch
    faInfoCircle,
    faExclamationTriangle,
    faCircleXmark,
    faSpinner
)

const app = createApp(App)
app.component('font-awesome-icon', FontAwesomeIcon)
app.mount('#app')