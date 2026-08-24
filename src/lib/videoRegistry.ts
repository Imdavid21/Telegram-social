class VideoPlaybackRegistry {
  private current: HTMLVideoElement | null = null

  async requestPlay(video: HTMLVideoElement) {
    if (this.current && this.current !== video) this.current.pause()
    this.current = video
    try { await video.play() } catch {}
  }

  requestPause(video: HTMLVideoElement) {
    video.pause()
    if (this.current === video) this.current = null
  }

  clear(video: HTMLVideoElement) {
    if (this.current === video) this.current = null
  }
}

export const videoRegistry = new VideoPlaybackRegistry()

export function storedVideoMuted() {
  try { return sessionStorage.getItem('supergram-video-muted') !== 'false' } catch { return true }
}

export function persistVideoMuted(muted: boolean) {
  try { sessionStorage.setItem('supergram-video-muted', String(muted)) } catch {}
}
