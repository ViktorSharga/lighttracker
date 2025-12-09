# UI Redesign Branch - Code Review Report

**Branch:** `feature/ui-redesign`
**Reviewed:** 2025-12-09
**Reviewer:** Claude Code

---

## Summary

| Severity | Count | Categories |
|----------|-------|------------|
| 🔴 Critical | 3 | Missing props, memory leaks |
| 🟠 High | 4 | Reactivity bugs, broken emit |
| 🟡 Medium | 6 | Animation issues, state sync |
| 🔵 Low | 2 | Code quality |

**Total: 15 bugs identified**

---

## 🔴 Critical Bugs (Will Cause Runtime Errors)

### 1. Missing Required Props in HistoryTab.vue

**File:** `frontend/src/views/HistoryTab.vue:36-37`
```vue
<!-- BUG: GroupsGrid requires 'summary' prop but it's not passed -->
<GroupsGrid @select-group="handleGroupSelect" />
```

**File:** `frontend/src/components/history/GroupsGrid.vue:8-11`
```ts
interface Props {
  summary: HistorySummary  // Required!
}
const props = defineProps<Props>()
```

**Impact:** Component will crash or show `undefined` when accessing `props.summary.groupSummaries`

**Fix:** Pass the summary prop:
```vue
<GroupsGrid v-if="summary" :summary="summary" @select-group="handleGroupSelect" />
```

---

### 2. Missing Required Prop for DaySummaryCard

**File:** `frontend/src/views/HistoryTab.vue:33`
```vue
<!-- BUG: DaySummaryCard requires 'summary' prop but it's not passed -->
<DaySummaryCard v-if="summary" />
```

**File:** `frontend/src/components/history/DaySummaryCard.vue:7-10`
```ts
interface Props {
  summary: HistorySummary | null  // Required!
}
```

**Impact:** Component will render empty/broken UI

**Fix:**
```vue
<DaySummaryCard v-if="summary" :summary="summary" />
```

---

### 3. Memory Leak in Timeline24Hour.vue

**File:** `frontend/src/components/current/Timeline24Hour.vue:26-38`
```ts
onMounted(() => {
  // ...animation code...

  // BUG: Return value from onMounted is ignored!
  // This interval is NEVER cleared
  const interval = setInterval(() => {
    currentHour.value = new Date().getHours()
  }, 60000)

  return () => clearInterval(interval)  // ❌ Vue ignores this return
})
```

**Impact:** Memory leak - interval continues running after component unmount

**Fix:**
```ts
let interval: ReturnType<typeof setInterval>

onMounted(() => {
  // ...animation code...
  interval = setInterval(() => {
    currentHour.value = new Date().getHours()
  }, 60000)
})

onUnmounted(() => {
  clearInterval(interval)
})
```

---

## 🟠 High Severity Bugs (Reactivity/Logic Issues)

### 4. Composable Called Inside Computed (Anti-pattern)

**File:** `frontend/src/components/current/CountdownAlert.vue:19-24`
```ts
// BUG: Composables should NOT be called inside computed!
const countdown = computed(() => {
  if (!myGroup.value || !current.value) {
    return null
  }
  return useCountdown(myGroup.value, current.value)  // ❌ Creates new reactive state each time
})
```

**Impact:** Creates new timers/watchers on every schedule change, causes memory leaks and inconsistent state

**Fix:** Call composable at setup-time and make it reactive internally:
```ts
const countdown = useCountdown(myGroup, current)  // Pass refs, handle null inside composable
```

---

### 5. Non-Reactive Parameter in useTimelineData

**File:** `frontend/src/composables/useTimelineData.ts:14`
```ts
// BUG: groupData is not reactive - changes won't trigger updates
export function useTimelineData(groupData: GroupData | null) {
```

**Impact:** When `groupData` changes (e.g., schedule refresh), the computed values won't update

**Fix:**
```ts
import { toValue, type MaybeRefOrGetter } from 'vue'

export function useTimelineData(groupData: MaybeRefOrGetter<GroupData | null>) {
  // Use toValue(groupData) inside computeds
}
```

---

### 6. GroupsGrid Emit Not Working

**File:** `frontend/src/components/history/GroupsGrid.vue:42-44`
```ts
// selectGroup calls store directly, doesn't emit
const selectGroup = (groupId: GroupId) => {
  historyStore.selectGroup(groupId)  // ❌ No emit
}
```

**File:** `frontend/src/views/HistoryTab.vue:35-36`
```vue
<!-- This handler is NEVER called! -->
<GroupsGrid @select-group="handleGroupSelect" />
```

**Impact:** `handleGroupSelect` in HistoryTab is dead code - group selection bypasses parent

**Fix:** Either remove the emit handler from parent, or add proper emit:
```ts
const emit = defineEmits<{
  'select-group': [groupId: GroupId]
}>()

const selectGroup = (groupId: GroupId) => {
  historyStore.selectGroup(groupId)
  emit('select-group', groupId)
}
```

---

### 7. Countdown State Duplication

**File:** `frontend/src/components/layout/StatusBar.vue:25-35`
```ts
// BUG: countdown duplicates nextFetchIn logic
const countdown = ref(0)

// nextFetchIn from useStatus is ALSO being decremented every second
const { nextFetchIn } = useStatus()

// This creates two independent countdowns that can drift
countdownTimer = setInterval(() => {
  countdown.value = nextFetchIn.value  // Copies value that's also being decremented
}, 1000)
```

**Impact:** Potential UI inconsistency between StatusBar and other consumers of `nextFetchIn`

**Fix:** Use `nextFetchIn` directly from the composable without local duplication.

---

## 🟡 Medium Severity Bugs (Potential Issues)

### 8. Unsafe DOM Query in GroupCardsGrid.vue

**File:** `frontend/src/components/current/GroupCardsGrid.vue:52-61`
```ts
// BUG: Uses global selector - could animate wrong elements
setTimeout(() => {
  const cards = document.querySelectorAll('.group-card')  // ❌ Global query
  if (cards.length > 0) {
    gsap.fromTo(cards, ...)
  }
}, 50)
```

**Impact:** Could animate `.group-card` elements from other components on the page

**Fix:** Use template refs:
```ts
const containerRef = ref<HTMLElement | null>(null)
// Then: containerRef.value?.querySelectorAll('.group-card')
```

---

### 9. Template Refs Array Cleanup Issue

**File:** `frontend/src/components/current/StatsGrid.vue:75-77`
```ts
const cardRefs = ref<HTMLElement[]>([])

// BUG: Refs aren't cleaned up on re-render
:ref="(el) => { if (el) cardRefs[index] = el as HTMLElement }"
```

**Impact:** Stale refs after component re-renders with different data

**Fix:**
```ts
// Reset array before rendering
const cardRefs = ref<HTMLElement[]>([])
watch(() => cards.value, () => { cardRefs.value = [] }, { flush: 'pre' })
```

---

### 10. GSAP Animation on Conditional Element

**File:** `frontend/src/components/history/TimelineEntry.vue:82-90`
```ts
const toggleExpand = () => {
  isExpanded.value = !isExpanded.value

  // BUG: detailsRef might not be in DOM yet when this runs
  if (isExpanded.value && detailsRef.value) {
    gsap.fromTo(detailsRef.value, ...)
  }
}
```

**Impact:** Animation may not work if Vue hasn't rendered the element yet

**Fix:**
```ts
const toggleExpand = async () => {
  isExpanded.value = !isExpanded.value
  await nextTick()  // Wait for DOM update
  if (isExpanded.value && detailsRef.value) {
    gsap.fromTo(detailsRef.value, ...)
  }
}
```

---

### 11. Date Input State Not Synced with Store

**File:** `frontend/src/components/statistics/ComparisonDateRange.vue:13-14`
```ts
// BUG: Local state initialized once but never synced back
const dateFrom = ref<string>(statisticsStore.comparisonDateFrom || '')
const dateTo = ref<string>(statisticsStore.comparisonDateTo || '')
```

**Impact:** If store is updated externally, UI won't reflect changes

**Fix:**
```ts
const dateFrom = computed({
  get: () => statisticsStore.comparisonDateFrom || '',
  set: (v) => statisticsStore.setComparisonDateRange(v || null, dateTo.value || null)
})
```

---

### 12. AnimatedCounter Double Animation

**File:** `frontend/src/components/ui/AnimatedCounter.vue:27-35`
```ts
// BUG: Both watch and onMounted animate on initial render
watch(() => props.value, (newValue) => {
  animateToValue(newValue)
})

onMounted(() => {
  animateToValue(props.value)  // Also triggers on mount
})
```

**Impact:** Initial value animates twice if watch triggers immediately

**Fix:**
```ts
watch(() => props.value, (newValue, oldValue) => {
  if (oldValue !== undefined) {  // Skip initial
    animateToValue(newValue)
  }
}, { immediate: false })

onMounted(() => {
  displayValue.value = props.value  // Set directly without animation, or:
  animateToValue(props.value)
})
```

---

### 13. TabNavigation Slot Never Used

**File:** `frontend/src/components/layout/TabNavigation.vue:57-60`
```vue
<!-- Content wrapper for fade animations -->
<div ref="contentRef" class="mt-6">
  <slot />  <!-- ❌ Never receives content -->
</div>
```

**File:** `frontend/src/App.vue` - Tab content is rendered separately via `<component :is="currentTabComponent">`

**Impact:** Confusing architecture - the `contentRef` animation wrapper does nothing

**Fix:** Either remove the slot from TabNavigation, or restructure App.vue to pass content through the slot.

---

## 🔵 Low Severity (Code Quality)

### 14. Unused Local State in HistoryTab.vue

**File:** `frontend/src/views/HistoryTab.vue:16-17`
```ts
// selectedGroupId is defined but GroupHistoryDetail gets it from store
const selectedGroupId = ref<GroupId | null>(null)

const handleGroupSelect = (groupId: GroupId | null) => {
  selectedGroupId.value = groupId
  historyStore.selectGroup(groupId)  // Store is source of truth
}
```

**Impact:** Redundant state - `selectedGroupId` serves no purpose since store is used directly

---

### 15. Hardcoded Animation Delays

**File:** `frontend/src/components/current/GroupCardsGrid.vue:53`
```ts
setTimeout(() => { ... }, 50)  // Magic number
```

Multiple components use arbitrary timeouts for animations. Should be centralized or use proper Vue lifecycle.

---

## Recommended Fix Priority

1. **Immediate** (Bugs 1-3): Fix missing props and memory leak - these will cause crashes
2. **High Priority** (Bugs 4-7): Fix reactivity issues - these cause subtle but significant problems
3. **Medium Priority** (Bugs 8-13): Address animation and state sync issues
4. **Low Priority** (Bugs 14-15): Clean up code quality issues

---

## Testing Recommendations

After fixes, verify:
- [ ] History tab loads without errors
- [ ] Day summary card displays data correctly
- [ ] Timeline updates when switching groups
- [ ] No memory leaks (check DevTools Performance tab)
- [ ] Countdown timers sync correctly
- [ ] Animations work on first render and re-renders
- [ ] Date range filters update in both directions
