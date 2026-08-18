import { DeleteCategoryBudget } from '@application/use-cases/budgets/DeleteCategoryBudget'
import { ListBudgetsByPeriod } from '@application/use-cases/budgets/ListBudgetsByPeriod'
import { UpsertCategoryBudget } from '@application/use-cases/budgets/UpsertCategoryBudget'
import { CreateCategory } from '@application/use-cases/categories/CreateCategory'
import { CountCategoryExpenses } from '@application/use-cases/categories/CountCategoryExpenses'
import { DeleteCategory } from '@application/use-cases/categories/DeleteCategory'
import { ListCategories } from '@application/use-cases/categories/ListCategories'
import { UpdateCategory } from '@application/use-cases/categories/UpdateCategory'
import { CreateExpense } from '@application/use-cases/expenses/CreateExpense'
import { DeleteExpense } from '@application/use-cases/expenses/DeleteExpense'
import { ListExpensesByPeriod } from '@application/use-cases/expenses/ListExpensesByPeriod'
import { UpdateExpense } from '@application/use-cases/expenses/UpdateExpense'
import { GetDashboardBudgetSummary } from '@application/use-cases/dashboard/GetDashboardBudgetSummary'
import { GetFinancialSnapshot } from '@application/use-cases/dashboard/GetFinancialSnapshot'
import { CreateIncome } from '@application/use-cases/incomes/CreateIncome'
import { DeleteIncome } from '@application/use-cases/incomes/DeleteIncome'
import { ListIncomesByPeriod } from '@application/use-cases/incomes/ListIncomesByPeriod'
import { UpdateIncome } from '@application/use-cases/incomes/UpdateIncome'
import { CreateExpectedIncome } from '@application/use-cases/incomes/CreateExpectedIncome'
import { MarkIncomeAsReceived } from '@application/use-cases/incomes/MarkIncomeAsReceived'
import { CancelExpectedIncome } from '@application/use-cases/incomes/CancelExpectedIncome'
import { SetCurrentBalance } from '@application/use-cases/balance/SetCurrentBalance'
import { ReconcileCurrentBalance } from '@application/use-cases/balance/ReconcileCurrentBalance'
import { CreatePeriod } from '@application/use-cases/periods/CreatePeriod'
import { DeletePeriod } from '@application/use-cases/periods/DeletePeriod'
import { ListPeriods } from '@application/use-cases/periods/ListPeriods'
import { SetActivePeriod } from '@application/use-cases/periods/SetActivePeriod'
import { UpdatePeriod } from '@application/use-cases/periods/UpdatePeriod'
import { CreateRecurringPayment } from '@application/use-cases/recurring-payments/CreateRecurringPayment'
import { DeleteRecurringPayment } from '@application/use-cases/recurring-payments/DeleteRecurringPayment'
import { GenerateOccurrencesForPeriod } from '@application/use-cases/recurring-payments/GenerateOccurrencesForPeriod'
import { MarkOccurrenceAsPaid } from '@application/use-cases/recurring-payments/MarkOccurrenceAsPaid'
import { MarkOccurrenceAsSkipped } from '@application/use-cases/recurring-payments/MarkOccurrenceAsSkipped'
import { GetRecurringOverview } from '@application/use-cases/recurring-payments/GetRecurringOverview'
import { ListOccurrencesByPeriod } from '@application/use-cases/recurring-payments/ListOccurrencesByPeriod'
import { ListRecurringPayments } from '@application/use-cases/recurring-payments/ListRecurringPayments'
import { ToggleRecurringPaymentStatus } from '@application/use-cases/recurring-payments/ToggleRecurringPaymentStatus'
import { UpdateRecurringPayment } from '@application/use-cases/recurring-payments/UpdateRecurringPayment'
import { GetUserSettings } from '@application/use-cases/settings/GetUserSettings'
import { InitializeLocalOwner } from '@application/use-cases/settings/InitializeLocalOwner'
import { SimulatePurchase } from '@application/use-cases/simulator/SimulatePurchase'
import { PrepareReceiptImage, RecognizeReceipt } from './receipt-workflow'
import { SignIn } from '@application/use-cases/auth/SignIn'
import { SignUp } from '@application/use-cases/auth/SignUp'
import { RequestPasswordReset } from '@application/use-cases/auth/RequestPasswordReset'
import { UpdatePassword } from '@application/use-cases/auth/UpdatePassword'
import { DeleteAccount } from '@application/use-cases/auth/DeleteAccount'
import {
  BackupService,
  type PreparedBackup,
} from '@application/services/BackupService'
import {
  DataMigrationService,
  LocalUserDataCleaner,
} from '@application/services/DataMigrationService'
import { SyncCoordinator } from '@application/services/SyncCoordinator'
import { SyncOrchestrator } from '@application/services/SyncOrchestrator'
import type {
  AuthClient,
  SessionService,
} from '@application/services/AuthClient'
import type { OwnerSessionStore } from '@application/services/OwnerSessionStore'
import type { BackupFile } from '@application/contracts/backup.schema'
import { BackupAdapter } from '@infrastructure/backup/BackupAdapter'
import { WebBackupFileAdapter } from '@infrastructure/backup/WebBackupFileAdapter'
import { GastoClaroDB } from '@infrastructure/local/database'
import { getOrCreateGuestOwnerId } from '@infrastructure/local/GuestOwnerStore'
import { DexieOwnerDataManager } from '@infrastructure/local/DexieOwnerDataManager'
import { LocalOwnerSessionStore } from '@infrastructure/local/LocalOwnerSessionStore'
import { SupabaseAuthClient } from '@infrastructure/auth/SupabaseAuthClient'
import { SupabaseAccountDeletionClient } from '@infrastructure/auth/SupabaseAccountDeletionClient'
import { SessionManager } from '@infrastructure/auth/SessionManager'
import { getSupabaseClient } from '@infrastructure/remote/SupabaseClient'
import { DexieSyncStore } from '@infrastructure/sync/DexieSyncStore'
import { SupabaseSyncGateway } from '@infrastructure/sync/SupabaseSyncGateway'
import { BrowserSyncScheduler } from '@infrastructure/sync/BrowserSyncScheduler'
import { DexieSyncQueueObserver } from '@infrastructure/sync/DexieSyncQueueObserver'
import { WebNetworkStatusProvider } from '@infrastructure/sync/WebNetworkStatusProvider'
import { EdgeFunctionOCRAdapter } from '@infrastructure/ocr/EdgeFunctionOCRAdapter'
import { EdgeFunctionAIAdapter } from '@infrastructure/ai/EdgeFunctionAIAdapter'
import {
  ExplainCategoryChanges,
  GeneratePeriodSummary,
  PrepareCategoryChanges,
  PreparePeriodSummary,
  SuggestExpenseCategory,
} from '@application/use-cases/ai-insights'
import {
  ReceiptImageCompressor,
  WebPlatformAdapter,
} from '@infrastructure/platform'
import {
  DexieCategoryBudgetRepository,
  DexieBalanceAnchorRepository,
  DexieCategoryRepository,
  DexieExpenseRepository,
  DexieIncomeRepository,
  DexiePeriodRepository,
  DexieRecurringPaymentOccurrenceRepository,
  DexieRecurringPaymentRepository,
  DexieUserSettingsRepository,
} from '@infrastructure/local/repositories'
import { DexieCategoryDeletionTransaction } from '@infrastructure/local/transactions/DexieCategoryDeletionTransaction'
import { DexieRecurringPaymentTransaction } from '@infrastructure/local/transactions/DexieRecurringPaymentTransaction'
import { Capacitor } from '@capacitor/core'
import type { NetworkStatusProvider } from '@application/services/SyncOrchestrator'
import type { PlatformAdapter } from '@infrastructure/platform'
import type { ExternalUrlProvider } from '@infrastructure/platform/ExternalUrlProvider'
import { CapacitorNetworkStatusProvider } from '@infrastructure/sync/CapacitorNetworkStatusProvider'
import {
  CapacitorExternalUrlProvider,
  CapacitorPlatformAdapter,
  WebExternalUrlProvider,
} from '@infrastructure/platform'
import { NativeAuthCallbackLifecycle } from '@infrastructure/auth/NativeAuthCallbackLifecycle'
import { NativeAuthSessionLifecycle } from '@infrastructure/auth/NativeAuthSessionLifecycle'
import { getAuthRedirectUrl } from '@infrastructure/auth/AuthRedirectUrl'

type Executable<T> = Pick<T, Extract<keyof T, 'execute'>>

export interface ApplicationServices {
  ownerId: string
  initialize: Executable<InitializeLocalOwner>
  settings: { getUserSettings: Executable<GetUserSettings> }
  balance: {
    setCurrentBalance: Executable<SetCurrentBalance>
    reconcileCurrentBalance: Executable<ReconcileCurrentBalance>
  }
  periods: {
    createPeriod: Executable<CreatePeriod>
    updatePeriod: Executable<UpdatePeriod>
    deletePeriod: Executable<DeletePeriod>
    listPeriods: Executable<ListPeriods>
    setActivePeriod: Executable<SetActivePeriod>
  }
  incomes: {
    createIncome: Executable<CreateIncome>
    createExpectedIncome: Executable<CreateExpectedIncome>
    markIncomeAsReceived: Executable<MarkIncomeAsReceived>
    cancelExpectedIncome: Executable<CancelExpectedIncome>
    updateIncome: Executable<UpdateIncome>
    deleteIncome: Executable<DeleteIncome>
    listIncomesByPeriod: Executable<ListIncomesByPeriod>
  }
  expenses: {
    createExpense: Executable<CreateExpense>
    updateExpense: Executable<UpdateExpense>
    deleteExpense: Executable<DeleteExpense>
    listExpensesByPeriod: Executable<ListExpensesByPeriod>
  }
  categories: {
    createCategory: Executable<CreateCategory>
    updateCategory: Executable<UpdateCategory>
    deleteCategory: Executable<DeleteCategory>
    listCategories: Executable<ListCategories>
    countCategoryExpenses: Executable<CountCategoryExpenses>
  }
  budgets: {
    upsertCategoryBudget: Executable<UpsertCategoryBudget>
    deleteCategoryBudget: Executable<DeleteCategoryBudget>
    listBudgetsByPeriod: Executable<ListBudgetsByPeriod>
  }
  recurringPayments: {
    createRecurringPayment: Executable<CreateRecurringPayment>
    updateRecurringPayment: Executable<UpdateRecurringPayment>
    deleteRecurringPayment: Executable<DeleteRecurringPayment>
    toggleRecurringPaymentStatus: Executable<ToggleRecurringPaymentStatus>
    generateOccurrencesForPeriod: Executable<GenerateOccurrencesForPeriod>
    markOccurrenceAsPaid: Executable<MarkOccurrenceAsPaid>
    markOccurrenceAsSkipped: Executable<MarkOccurrenceAsSkipped>
    listRecurringPayments: Executable<ListRecurringPayments>
    listOccurrencesByPeriod: Executable<ListOccurrencesByPeriod>
    getOverview: Executable<GetRecurringOverview>
  }
  dashboard: {
    getBudgetSummary: Executable<GetDashboardBudgetSummary>
    getFinancialSnapshot: Executable<GetFinancialSnapshot>
  }
  simulator: { simulatePurchase: Executable<SimulatePurchase> }
  backup: {
    exportBackup(): Promise<BackupFile>
    serialize(file: BackupFile): string
    prepareImport(serialized: string): PreparedBackup
    importBackup(file: BackupFile): Promise<void>
    readFile(file: File): Promise<string>
    download(serialized: string, exportedAt: string): void
  }
  receipts: {
    prepareImage: Executable<PrepareReceiptImage>
    recognizeReceipt: Executable<RecognizeReceipt>
  }
  aiData: {
    preparePeriodSummary: Executable<PreparePeriodSummary>
    prepareCategoryChanges: Executable<PrepareCategoryChanges>
  }
  aiInsights: {
    suggestExpenseCategory: Executable<SuggestExpenseCategory>
    generatePeriodSummary: Executable<GeneratePeriodSummary>
    explainCategoryChanges: Executable<ExplainCategoryChanges>
  } | null
  sync: Pick<
    SyncCoordinator,
    'sync' | 'fullSync' | 'uploadPendingChanges' | 'downloadRemoteChanges'
  > | null
  syncOrchestrator: SyncOrchestrator | null
  externalUrls: ExternalUrlProvider
}

export interface AuthRuntime {
  authClient: AuthClient
  sessionManager: SessionService
  signUp: Executable<SignUp>
  signIn: Executable<SignIn>
  requestPasswordReset: Executable<RequestPasswordReset>
  updatePassword: Executable<UpdatePassword>
  deleteAccount: Executable<DeleteAccount>
  migration: DataMigrationService
  cleaner: LocalUserDataCleaner
  ownerStore: OwnerSessionStore
  authCallbacks: NativeAuthCallbackLifecycle | null
  authSessionLifecycle: NativeAuthSessionLifecycle | null
  redirectUrl(path: '/verify-email' | '/reset-password'): string
}

export interface PlatformServices {
  receiptImages: PlatformAdapter
  network: NetworkStatusProvider
  externalUrls: ExternalUrlProvider
}

export function createPlatformServices(
  native = Capacitor.isNativePlatform(),
): PlatformServices {
  return native
    ? {
        receiptImages: new CapacitorPlatformAdapter(),
        network: new CapacitorNetworkStatusProvider(),
        externalUrls: new CapacitorExternalUrlProvider(),
      }
    : {
        receiptImages: new WebPlatformAdapter(),
        network: new WebNetworkStatusProvider(),
        externalUrls: new WebExternalUrlProvider(),
      }
}

export const applicationDatabase = new GastoClaroDB()

export function createApplicationServices(
  ownerId = getOrCreateGuestOwnerId(),
  database = applicationDatabase,
): ApplicationServices {
  const ids = { generate: () => globalThis.crypto.randomUUID() }
  const clock = { now: () => new Date().toISOString() }
  const syncDependencies = { ids, clock }
  const periods = new DexiePeriodRepository(database, ownerId, syncDependencies)
  const anchors = new DexieBalanceAnchorRepository(
    database,
    ownerId,
    syncDependencies,
  )
  const incomes = new DexieIncomeRepository(database, ownerId, syncDependencies)
  const expenses = new DexieExpenseRepository(
    database,
    ownerId,
    syncDependencies,
  )
  const categories = new DexieCategoryRepository(
    database,
    ownerId,
    syncDependencies,
  )
  const budgets = new DexieCategoryBudgetRepository(
    database,
    ownerId,
    syncDependencies,
  )
  const payments = new DexieRecurringPaymentRepository(
    database,
    ownerId,
    syncDependencies,
  )
  const occurrences = new DexieRecurringPaymentOccurrenceRepository(
    database,
    ownerId,
    syncDependencies,
  )
  const recurringPaymentTransaction = new DexieRecurringPaymentTransaction(
    database,
    ids,
    clock,
  )
  const settings = new DexieUserSettingsRepository(
    database,
    ownerId,
    syncDependencies,
  )
  const getDashboardBudgetSummary = new GetDashboardBudgetSummary(
    budgets,
    expenses,
  )
  const getFinancialSnapshot = new GetFinancialSnapshot(
    periods,
    anchors,
    incomes,
    expenses,
    occurrences,
    clock,
  )
  const backupService = new BackupService(
    new BackupAdapter(database, syncDependencies),
    clock.now,
  )
  const backupFiles = new WebBackupFileAdapter()
  const supabase = getSupabaseClient()
  const platformServices = createPlatformServices()
  const imageCompressor = new ReceiptImageCompressor()
  const recognitionProvider = supabase
    ? new EdgeFunctionOCRAdapter(supabase)
    : null
  const aiProvider = supabase ? new EdgeFunctionAIAdapter(supabase) : null
  const aiData = {
    preparePeriodSummary: new PreparePeriodSummary(
      incomes,
      expenses,
      categories,
    ),
    prepareCategoryChanges: new PrepareCategoryChanges(expenses, categories),
  }
  const aiInsights = aiProvider
    ? {
        suggestExpenseCategory: new SuggestExpenseCategory(aiProvider),
        generatePeriodSummary: new GeneratePeriodSummary(aiProvider),
        explainCategoryChanges: new ExplainCategoryChanges(aiProvider),
      }
    : null
  const sync = supabase
    ? new SyncCoordinator(
        new DexieSyncStore(database),
        new SupabaseSyncGateway(supabase),
      )
    : null
  const syncOrchestrator = sync
    ? new SyncOrchestrator(
        sync,
        new DexieSyncQueueObserver(database),
        platformServices.network,
        new BrowserSyncScheduler(),
      )
    : null

  return {
    ownerId,
    initialize: new InitializeLocalOwner(
      ownerId,
      settings,
      categories,
      ids,
      clock,
    ),
    settings: { getUserSettings: new GetUserSettings(settings) },
    balance: {
      setCurrentBalance: new SetCurrentBalance(anchors, ids, clock),
      reconcileCurrentBalance: new ReconcileCurrentBalance(anchors, ids, clock),
    },
    periods: {
      createPeriod: new CreatePeriod(periods, ids, clock),
      updatePeriod: new UpdatePeriod(periods, clock),
      deletePeriod: new DeletePeriod(periods),
      listPeriods: new ListPeriods(periods),
      setActivePeriod: new SetActivePeriod(periods, settings, clock),
    },
    incomes: {
      createIncome: new CreateIncome(incomes, periods, ids, clock),
      createExpectedIncome: new CreateExpectedIncome(
        incomes,
        periods,
        ids,
        clock,
      ),
      markIncomeAsReceived: new MarkIncomeAsReceived(incomes, clock),
      cancelExpectedIncome: new CancelExpectedIncome(incomes, clock),
      updateIncome: new UpdateIncome(incomes, periods, clock),
      deleteIncome: new DeleteIncome(incomes),
      listIncomesByPeriod: new ListIncomesByPeriod(incomes),
    },
    expenses: {
      createExpense: new CreateExpense(
        expenses,
        periods,
        categories,
        ids,
        clock,
      ),
      updateExpense: new UpdateExpense(expenses, periods, categories, clock),
      deleteExpense: new DeleteExpense(expenses, recurringPaymentTransaction),
      listExpensesByPeriod: new ListExpensesByPeriod(expenses),
    },
    categories: {
      createCategory: new CreateCategory(categories, ids, clock),
      updateCategory: new UpdateCategory(categories, clock),
      deleteCategory: new DeleteCategory(
        categories,
        new DexieCategoryDeletionTransaction(
          database,
          ownerId,
          syncDependencies,
        ),
      ),
      listCategories: new ListCategories(categories),
      countCategoryExpenses: new CountCategoryExpenses(categories),
    },
    budgets: {
      upsertCategoryBudget: new UpsertCategoryBudget(
        budgets,
        periods,
        categories,
        ids,
        clock,
      ),
      deleteCategoryBudget: new DeleteCategoryBudget(budgets),
      listBudgetsByPeriod: new ListBudgetsByPeriod(budgets),
    },
    recurringPayments: {
      createRecurringPayment: new CreateRecurringPayment(
        payments,
        categories,
        ids,
        clock,
      ),
      updateRecurringPayment: new UpdateRecurringPayment(payments, clock),
      deleteRecurringPayment: new DeleteRecurringPayment(payments),
      toggleRecurringPaymentStatus: new ToggleRecurringPaymentStatus(
        payments,
        clock,
      ),
      generateOccurrencesForPeriod: new GenerateOccurrencesForPeriod(
        periods,
        payments,
        occurrences,
        ids,
        clock,
      ),
      markOccurrenceAsPaid: new MarkOccurrenceAsPaid(
        recurringPaymentTransaction,
      ),
      markOccurrenceAsSkipped: new MarkOccurrenceAsSkipped(occurrences, clock),
      listRecurringPayments: new ListRecurringPayments(payments),
      listOccurrencesByPeriod: new ListOccurrencesByPeriod(occurrences),
      getOverview: new GetRecurringOverview(payments, occurrences),
    },
    dashboard: {
      getBudgetSummary: getDashboardBudgetSummary,
      getFinancialSnapshot,
    },
    simulator: {
      simulatePurchase: new SimulatePurchase(
        getFinancialSnapshot,
        budgets,
        expenses,
      ),
    },
    backup: {
      exportBackup: () => backupService.exportBackup(ownerId),
      serialize: (file) => backupService.serialize(file),
      prepareImport: (serialized) => backupService.prepareImport(serialized),
      importBackup: (file) => backupService.importBackup(ownerId, file),
      readFile: (file) => backupFiles.readText(file),
      download: (serialized, exportedAt) =>
        backupFiles.download(serialized, exportedAt),
    },
    receipts: {
      prepareImage: new PrepareReceiptImage(
        platformServices.receiptImages,
        imageCompressor,
      ),
      recognizeReceipt: new RecognizeReceipt(recognitionProvider),
    },
    aiData,
    aiInsights,
    sync,
    syncOrchestrator,
    externalUrls: platformServices.externalUrls,
  }
}

export function createAuthRuntime(
  database = applicationDatabase,
  native = Capacitor.isNativePlatform(),
): AuthRuntime | null {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const authClient = new SupabaseAuthClient(supabase)
  const ownerData = new DexieOwnerDataManager(database)
  const nativeLifecycles = createNativeAuthLifecycles(authClient, native)
  return {
    authClient,
    sessionManager: new SessionManager(authClient),
    signUp: new SignUp(authClient),
    signIn: new SignIn(authClient),
    requestPasswordReset: new RequestPasswordReset(authClient),
    updatePassword: new UpdatePassword(authClient),
    deleteAccount: new DeleteAccount(
      new SupabaseAccountDeletionClient(supabase),
    ),
    migration: new DataMigrationService(ownerData),
    cleaner: new LocalUserDataCleaner(ownerData),
    ownerStore: new LocalOwnerSessionStore(),
    ...nativeLifecycles,
    redirectUrl: (path) =>
      getAuthRedirectUrl(path, native, window.location.origin),
  }
}

export function createNativeAuthLifecycles(
  authClient: AuthClient,
  native: boolean,
): Pick<AuthRuntime, 'authCallbacks' | 'authSessionLifecycle'> {
  return native
    ? {
        authCallbacks: new NativeAuthCallbackLifecycle(authClient),
        authSessionLifecycle: new NativeAuthSessionLifecycle(authClient),
      }
    : { authCallbacks: null, authSessionLifecycle: null }
}

export const compositionRoot = createApplicationServices()
export const authRuntime = createAuthRuntime()
