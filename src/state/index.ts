// Public entry point of src/state (PROMPT.md section 4.5 and docs/notes/contracts.md section 4).
export {
  useSettingsStore,
  resolveUserColor,
  SETTINGS_STORAGE_KEY,
  defaultPieceSet,
  type SettingsState,
} from './settingsStore'
export {
  useReviewStore,
  type ReviewState,
  type Screen,
  type KeyedText,
  type EngineView,
  type Progress,
  type RetryGrade,
  type RetryState,
} from './reviewStore'
export {
  readUrlState,
  toSearch,
  writeUrlState,
  buildShareLink,
  gameIdToLink,
  gameIdOf,
  receiveGameId,
  type UrlState,
  type UrlGameAction,
} from './urlState'
export { persistReview, loadReview, loadGame, saveGame, listRecent, type RecentGame } from './persistence'
export { installEngineStats } from './engineStats'
export {
  bootApp,
  submitInput,
  confirmPending,
  cancelPending,
  chooseGame,
  openRecent,
  newGame,
  ensureEngine,
  retryEngine,
  retestSpeed,
  explanationFor,
  startRetry,
  stopRetry,
  tryRetryMove,
  gradeOf,
  praiseKey,
  tierFor,
  engineProfileFor,
  defaultProfileFor,
  storedTier,
  getDevice,
  deployTarget,
  type EngineStatus,
} from './controller'
