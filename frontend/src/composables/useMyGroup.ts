import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '@/stores/preferencesStore'
import { useScheduleStore } from '@/stores/scheduleStore'
import type { GroupId, GroupData } from '@/services/types'

/**
 * Composable that wraps preferencesStore.myGroup with convenience methods
 * Provides easy access to user's selected group and related data
 */
export function useMyGroup() {
  const preferencesStore = usePreferencesStore()
  const scheduleStore = useScheduleStore()
  const { myGroup } = storeToRefs(preferencesStore)
  const { current } = storeToRefs(scheduleStore)

  // Get data for the user's selected group from current schedule
  const myGroupData = computed<GroupData | null>(() => {
    if (!myGroup.value || !current.value) {
      return null
    }
    return current.value.groups[myGroup.value] ?? null
  })

  // Check if a given group ID is the user's selected group
  const isMyGroup = (groupId: GroupId): boolean => {
    return myGroup.value === groupId
  }

  // Set the user's group preference
  const setMyGroup = (groupId: GroupId | null) => {
    preferencesStore.setMyGroup(groupId)
  }

  return {
    myGroup,
    myGroupData,
    isMyGroup,
    setMyGroup,
  }
}
