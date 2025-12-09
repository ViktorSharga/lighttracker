<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions
} from 'chart.js'
import { useStatisticsStore } from '@/stores/statisticsStore'
import GlassCard from '@/components/ui/GlassCard.vue'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const statisticsStore = useStatisticsStore()

// Chart configuration
const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      enabled: true,
      backgroundColor: 'rgba(30, 30, 50, 0.95)',
      titleColor: '#ffffff',
      bodyColor: '#e5e7eb',
      borderColor: 'rgba(91, 141, 239, 0.5)',
      borderWidth: 1,
      padding: 12,
      cornerRadius: 8,
      displayColors: false,
      titleFont: {
        size: 13,
        weight: '600',
      },
      bodyFont: {
        size: 14,
        weight: '500',
      },
      callbacks: {
        title: (tooltipItems) => {
          return tooltipItems[0]?.label || ''
        },
        label: (context) => {
          const value = context.parsed.y
          if (statisticsStore.chartType === 'percent') {
            return `${value.toFixed(1)}% зі світлом`
          } else {
            return `${value.toFixed(1)} год зі світлом`
          }
        },
      },
    },
  },
  scales: {
    x: {
      grid: {
        color: 'rgba(255, 255, 255, 0.1)',
        drawTicks: false,
      },
      ticks: {
        color: '#9ca3af',
        font: {
          size: 11,
        },
        maxRotation: 45,
        minRotation: 0,
      },
      border: {
        display: false,
      },
    },
    y: {
      grid: {
        color: 'rgba(255, 255, 255, 0.1)',
        drawTicks: false,
      },
      ticks: {
        color: '#9ca3af',
        font: {
          size: 11,
        },
        callback: function (value) {
          if (statisticsStore.chartType === 'percent') {
            return `${value}%`
          } else {
            return `${value}год`
          }
        },
      },
      border: {
        display: false,
      },
      beginAtZero: true,
      max: statisticsStore.chartType === 'percent' ? 100 : 24,
    },
  },
}))

// Chart data with gradient
const chartData = computed<ChartData<'line'>>(() => {
  const baseData = statisticsStore.chartData

  if (!baseData.datasets || baseData.datasets.length === 0) {
    return {
      labels: [],
      datasets: [],
    }
  }

  return {
    labels: baseData.labels,
    datasets: [
      {
        label: baseData.datasets[0].label,
        data: baseData.datasets[0].data as number[],
        borderColor: 'rgba(91, 141, 239, 1)',
        backgroundColor: (context) => {
          const ctx = context.chart.ctx
          const gradient = ctx.createLinearGradient(0, 0, 0, context.chart.height)
          gradient.addColorStop(0, 'rgba(91, 141, 239, 0.3)')
          gradient.addColorStop(0.5, 'rgba(91, 141, 239, 0.15)')
          gradient.addColorStop(1, 'rgba(91, 141, 239, 0)')
          return gradient
        },
        borderWidth: 2.5,
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: 'rgba(91, 141, 239, 1)',
        pointBorderColor: '#1a1a2e',
        pointBorderWidth: 2,
        pointHoverBackgroundColor: 'rgba(91, 141, 239, 1)',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2,
      },
    ],
  }
})

// Empty state
const isEmpty = computed(() => {
  return !chartData.value.labels || chartData.value.labels.length === 0
})
</script>

<template>
  <GlassCard variant="default" class="p-6">
    <div class="mb-4">
      <h3 class="text-lg font-semibold text-white">
        {{ statisticsStore.chartType === 'percent' ? 'Відсоток часу зі світлом' : 'Години зі світлом' }}
      </h3>
      <p class="text-sm text-gray-400 mt-1">
        Динаміка змін за обраний період
      </p>
    </div>

    <div v-if="isEmpty" class="flex items-center justify-center h-[400px] text-gray-400">
      <div class="text-center">
        <p class="text-lg mb-2">Немає даних для відображення</p>
        <p class="text-sm">Оберіть інший діапазон дат</p>
      </div>
    </div>

    <div v-else class="relative h-[400px]">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </GlassCard>
</template>
