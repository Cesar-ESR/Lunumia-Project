export interface BackupFilePort {
  readText(file: File): Promise<string>
  download(serialized: string, exportedAt: string): void
}

export class WebBackupFileAdapter implements BackupFilePort {
  readText(file: File): Promise<string> {
    return file.text()
  }

  download(serialized: string, exportedAt: string): void {
    const date = exportedAt.slice(0, 10)
    const blob = new Blob([serialized], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `lunumia-backup-${date}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }
}
