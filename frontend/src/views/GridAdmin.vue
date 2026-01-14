<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface GridStatusRecord {
  timestamp: string
  status: 'online' | 'offline'
  scheduleRef?: { dateKey: string; fetchedAt: string } | null
  manual?: boolean
}

const history = ref<GridStatusRecord[]>([])
const loading = ref(false)
const selectedDate = ref('')
const newStatus = ref<'online' | 'offline'>('offline')
const newTime = ref('')
const error = ref('')

// Get unique dates from history
const availableDates = computed(() => {
  const dates = new Set<string>()
  history.value.forEach(r => {
    const date = r.timestamp.split('T')[0]
    dates.add(date)
  })
  return Array.from(dates).sort().reverse()
})

// Filter history by selected date
const filteredHistory = computed(() => {
  if (!selectedDate.value) return history.value
  return history.value.filter(r => r.timestamp.startsWith(selectedDate.value))
})

// Format timestamp for display
function formatTime(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// Fetch all history
async function fetchHistory() {
  loading.value = true
  try {
    const res = await fetch('/api/grid-status/export')
    const data = await res.json()
    history.value = data.history || []
  } catch (e) {
    error.value = 'Failed to load history'
  } finally {
    loading.value = false
  }
}

// Add new record
async function addRecord() {
  if (!newTime.value) {
    error.value = 'Please enter time'
    return
  }

  const date = selectedDate.value || new Date().toISOString().split('T')[0]
  const timestamp = new Date(`${date}T${newTime.value}:00`).toISOString()

  try {
    const res = await fetch('/api/grid-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp, status: newStatus.value })
    })
    if (res.ok) {
      newTime.value = ''
      await fetchHistory()
    } else {
      const data = await res.json()
      error.value = data.error || 'Failed to add record'
    }
  } catch (e) {
    error.value = 'Failed to add record'
  }
}

// Delete record
async function deleteRecord(timestamp: string) {
  if (!confirm('Delete this record?')) return

  try {
    const res = await fetch(`/api/grid-status/${encodeURIComponent(timestamp)}`, {
      method: 'DELETE'
    })
    if (res.ok) {
      await fetchHistory()
    } else {
      error.value = 'Failed to delete record'
    }
  } catch (e) {
    error.value = 'Failed to delete record'
  }
}

onMounted(() => {
  fetchHistory()
  // Set default date to today
  selectedDate.value = new Date().toISOString().split('T')[0]
})
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-6">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-2xl font-bold mb-6">Grid Status Admin</h1>

      <!-- Error message -->
      <div v-if="error" class="bg-red-900/50 border border-red-500 rounded p-3 mb-4">
        {{ error }}
        <button @click="error = ''" class="ml-4 text-red-300 hover:text-white">&times;</button>
      </div>

      <!-- Date filter -->
      <div class="mb-6 flex gap-4 items-center">
        <label class="text-gray-400">Filter by date:</label>
        <select v-model="selectedDate" class="bg-gray-800 border border-gray-600 rounded px-3 py-2">
          <option value="">All dates</option>
          <option v-for="date in availableDates" :key="date" :value="date">{{ date }}</option>
        </select>
        <span class="text-gray-500">{{ filteredHistory.length }} records</span>
      </div>

      <!-- Add new record -->
      <div class="bg-gray-800 rounded-lg p-4 mb-6">
        <h2 class="text-lg font-semibold mb-3">Add New Record</h2>
        <div class="flex gap-4 items-end flex-wrap">
          <div>
            <label class="block text-gray-400 text-sm mb-1">Date</label>
            <input
              type="date"
              v-model="selectedDate"
              class="bg-gray-700 border border-gray-600 rounded px-3 py-2"
            />
          </div>
          <div>
            <label class="block text-gray-400 text-sm mb-1">Time (Kyiv)</label>
            <input
              type="time"
              v-model="newTime"
              class="bg-gray-700 border border-gray-600 rounded px-3 py-2"
            />
          </div>
          <div>
            <label class="block text-gray-400 text-sm mb-1">Status</label>
            <select v-model="newStatus" class="bg-gray-700 border border-gray-600 rounded px-3 py-2">
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </div>
          <button
            @click="addRecord"
            class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
          >
            Add
          </button>
        </div>
      </div>

      <!-- History table -->
      <div class="bg-gray-800 rounded-lg overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-700">
            <tr>
              <th class="text-left px-4 py-3">Time (Kyiv)</th>
              <th class="text-left px-4 py-3">Status</th>
              <th class="text-left px-4 py-3">Source</th>
              <th class="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="record in filteredHistory"
              :key="record.timestamp"
              class="border-t border-gray-700 hover:bg-gray-700/50"
            >
              <td class="px-4 py-3 font-mono text-sm">{{ formatTime(record.timestamp) }}</td>
              <td class="px-4 py-3">
                <span
                  :class="record.status === 'online' ? 'text-green-400' : 'text-red-400'"
                  class="font-medium"
                >
                  {{ record.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-gray-400 text-sm">
                {{ record.manual ? 'Manual' : 'Auto' }}
              </td>
              <td class="px-4 py-3 text-right">
                <button
                  @click="deleteRecord(record.timestamp)"
                  class="text-red-400 hover:text-red-300 text-sm"
                >
                  Delete
                </button>
              </td>
            </tr>
            <tr v-if="filteredHistory.length === 0">
              <td colspan="4" class="px-4 py-8 text-center text-gray-500">
                No records found
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Loading overlay -->
      <div v-if="loading" class="fixed inset-0 bg-black/50 flex items-center justify-center">
        <div class="text-xl">Loading...</div>
      </div>
    </div>
  </div>
</template>
