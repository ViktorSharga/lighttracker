import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { GroupId } from '@/services/types'

const STORAGE_KEY = 'lighttracker-preferences'

interface PreferencesState {
  myGroup: GroupId | null
  collapsedSections: Record<string, boolean>
  showMyGroupFirst: boolean
}

export const usePreferencesStore = defineStore('preferences', () => {
  // State
  const myGroup = ref<GroupId | null>(null)
  const collapsedSections = ref<Record<string, boolean>>({})
  const showMyGroupFirst = ref(false)

  // Actions
  const setMyGroup = (groupId: GroupId | null) => {
    myGroup.value = groupId
    saveToStorage()
  }

  const toggleSection = (sectionId: string) => {
    collapsedSections.value[sectionId] = !collapsedSections.value[sectionId]
    saveToStorage()
  }

  const loadFromStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data: PreferencesState = JSON.parse(stored)
        myGroup.value = data.myGroup ?? null
        collapsedSections.value = data.collapsedSections ?? {}
        showMyGroupFirst.value = data.showMyGroupFirst ?? false
      }
    } catch (error) {
      console.error('Failed to load preferences from storage:', error)
    }
  }

  const saveToStorage = () => {
    try {
      const data: PreferencesState = {
        myGroup: myGroup.value,
        collapsedSections: collapsedSections.value,
        showMyGroupFirst: showMyGroupFirst.value
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save preferences to storage:', error)
    }
  }

  // Auto-persist to localStorage on state changes
  // This is set up after the store is created
  return {
    // State
    myGroup,
    collapsedSections,
    showMyGroupFirst,
    // Actions
    setMyGroup,
    toggleSection,
    loadFromStorage,
    saveToStorage
  }
})
