import { requestApiJson } from '../lib/api-client'
import type { PrintReceiptData } from './print-service'

export interface PrintStation {
  id: string
  name: string
  lastSeenAt: string | null
  status: 'online' | 'offline'
  createdAt: string
  updatedAt: string
}

export interface RemotePrintJob {
  id: string
  stationId: string
  type: 'receipt'
  status: 'pending' | 'claimed' | 'printing' | 'printed' | 'failed' | 'cancelled'
  orderId: string | null
  requestedByUserId: string | null
  claimedByStationId: string | null
  claimedAt: string | null
  printedAt: string | null
  failedAt: string | null
  attempts: number
  maxAttempts: number
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export async function getPrintStations(): Promise<PrintStation[]> {
  const data = await requestApiJson<{ stations: PrintStation[] }>('/api/print-stations', {
    requireAuth: true,
  })

  return data.stations
}

export async function createReceiptPrintJob(options: {
  stationId: string
  orderId?: string
  payload: PrintReceiptData
}): Promise<RemotePrintJob> {
  const data = await requestApiJson<{ job: RemotePrintJob }>('/api/print-jobs', {
    method: 'POST',
    requireAuth: true,
    body: options,
  })

  return data.job
}

export async function getPrintJob(jobId: string): Promise<RemotePrintJob> {
  const data = await requestApiJson<{ job: RemotePrintJob }>(`/api/print-jobs/${encodeURIComponent(jobId)}`, {
    requireAuth: true,
  })

  return data.job
}
