import type { IpcFileRequest, IpcFileResponse, IpcSharePointVerifyResponse } from '../renderer/src/types'

export interface IElectronAPI {
  copyFile: (sourcePath: string, destPath: string, createDirs: boolean) => Promise<IpcFileResponse>
  verifySharePointFolder: (folderPath: string, verificationSubfolder: string) => Promise<IpcSharePointVerifyResponse>
  selectFolder: () => Promise<string | null>
  openFile: (filePath: string) => Promise<void>
  resolveSharePointPath: (sharePointRoot: string, relativePath: string) => Promise<string>
  sendNotification: (title: string, body: string, taskId: string, boardType: string, silent?: boolean) => void
  getAppVersion: () => Promise<string>
  onUpdateAvailable: (callback: () => void) => () => void
  onUpdateDownloaded: (callback: () => void) => () => void
  onNotificationClicked: (callback: (taskId: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: IElectronAPI
  }
}
