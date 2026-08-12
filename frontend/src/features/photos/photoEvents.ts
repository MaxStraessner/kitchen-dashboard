export const PHOTO_COLLECTION_CHANGED_EVENT = 'kitchen-dashboard:photos-changed'

export function notifyPhotoCollectionChanged() {
  window.dispatchEvent(new Event(PHOTO_COLLECTION_CHANGED_EVENT))
}
