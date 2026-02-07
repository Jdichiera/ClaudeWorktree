import { ipcMain } from 'electron'
import { bugReportService } from '../services/bug-report-service'
import { IPC_CHANNELS } from '@shared/types'

export function setupBugReportHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.BUG_REPORT_SUBMIT, async (_event, data: unknown) => {
    return bugReportService.submit(data)
  })
}
