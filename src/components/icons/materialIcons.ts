import { defineComponent, h } from 'vue'

const createMaterialIcon = (componentName: string, symbol: string) => defineComponent({
  name: componentName,
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => h('span', {
      ...attrs,
      'aria-hidden': attrs['aria-hidden'] ?? 'true',
      class: ['material-symbols-rounded', 'app-material-icon', attrs.class],
    }, symbol)
  },
})

export const ArrowDown = createMaterialIcon('ArrowDown', 'keyboard_arrow_down')
export const ArrowLeft = createMaterialIcon('ArrowLeft', 'arrow_back')
export const ArrowRight = createMaterialIcon('ArrowRight', 'arrow_forward')
export const Archive = createMaterialIcon('Archive', 'inventory_2')
export const Back = createMaterialIcon('Back', 'undo')
export const Brush = createMaterialIcon('Brush', 'cleaning_services')
export const Calendar = createMaterialIcon('Calendar', 'calendar_month')
export const ChatLineSquare = createMaterialIcon('ChatLineSquare', 'chat')
export const Check = createMaterialIcon('Check', 'check')
export const CircleCheck = createMaterialIcon('CircleCheck', 'check_circle')
export const Close = createMaterialIcon('Close', 'close')
export const Code = createMaterialIcon('Code', 'code_blocks')
export const Connection = createMaterialIcon('Connection', 'difference')
export const CopyDocument = createMaterialIcon('CopyDocument', 'content_copy')
export const Delete = createMaterialIcon('Delete', 'delete')
export const Document = createMaterialIcon('Document', 'description')
export const Download = createMaterialIcon('Download', 'download')
export const Edit = createMaterialIcon('Edit', 'edit_note')
export const Folder = createMaterialIcon('Folder', 'folder')
export const FolderOpened = createMaterialIcon('FolderOpened', 'folder_open')
export const HomeFilled = createMaterialIcon('HomeFilled', 'home')
export const InfoFilled = createMaterialIcon('InfoFilled', 'info')
export const Link = createMaterialIcon('Link', 'link')
export const List = createMaterialIcon('List', 'list_alt')
export const Loading = createMaterialIcon('Loading', 'progress_activity')
export const Minus = createMaterialIcon('Minus', 'remove')
export const Monitor = createMaterialIcon('Monitor', 'desktop_windows')
export const MoreFilled = createMaterialIcon('MoreFilled', 'more_vert')
export const Moon = createMaterialIcon('Moon', 'dark_mode')
export const OpenIn = createMaterialIcon('OpenIn', 'open_in_new')
export const Properties = createMaterialIcon('Properties', 'tune')
export const Plus = createMaterialIcon('Plus', 'add')
export const PriceTag = createMaterialIcon('PriceTag', 'sell')
export const Refresh = createMaterialIcon('Refresh', 'refresh')
export const RefreshLeft = createMaterialIcon('RefreshLeft', 'restart_alt')
export const RefreshRight = createMaterialIcon('RefreshRight', 'sync')
export const Setting = createMaterialIcon('Setting', 'settings')
export const Search = createMaterialIcon('Search', 'search')
export const Sunny = createMaterialIcon('Sunny', 'light_mode')
export const Switch = createMaterialIcon('Switch', 'contrast')
export const Terminal = createMaterialIcon('Terminal', 'terminal')
export const Upload = createMaterialIcon('Upload', 'upload')
export const User = createMaterialIcon('User', 'person')

// Branch nodes match the weight and current-color behavior of toolbar icons.
export const GitBranch = defineComponent({
  name: 'GitBranch',
  setup() {
    return () => h('svg', {
      viewBox: '0 0 24 24', width: '1em', height: '1em',
      fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
    }, [
      h('path', { d: 'M6 8v8M18 8v2a6 6 0 0 1-6 6H6' }),
      h('circle', { cx: 6, cy: 5, r: 3 }),
      h('circle', { cx: 6, cy: 19, r: 3 }),
      h('circle', { cx: 18, cy: 5, r: 3 }),
    ])
  },
})
