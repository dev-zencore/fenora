import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as NavigationBar from 'expo-navigation-bar';
import { requestDailyFolder, requestTemplateFile, testVaultAccess, writeOperationToDailyNote, type VaultConfig } from './src/obsidian';

type OperationType = 'expense' | 'income' | 'transfer';
type Account = { id: string; name: string; kind: string; balance: number; color: string };
type Operation = { id: string; type: OperationType; title: string; category: string; amount: number; accountId: string; date: string };
type Debt = { id: string; person: string; title: string; amount: number; remaining: number; direction: 'owed' | 'receivable'; dueDate?: string; reminder: boolean };
type Goal = { id: string; name: string; target: number; saved: number; color: string; monthly?: number };
type RecurringTemplate = { id: string; name: string; type: 'expense' | 'income'; amount?: number; category: string; schedule: string; enabled: boolean };
const initialCategories = ['Еда', 'Транспорт', 'Дом', 'Подписки', 'Здоровье', 'Покупки'];

const STORAGE_KEY = 'finora-state-v1';
const SETTINGS_KEY = 'finora-settings-v1';
const VAULT_KEY = 'finora-vault-v1';
const GOALS_KEY = 'finora-goals-v1';
const TEMPLATES_KEY = 'finora-templates-v1';
type BlockKey = 'today' | 'accounts' | 'recent';
const defaultBlocks: Record<BlockKey, boolean> = { today: true, accounts: true, recent: true };
const blockLabels: Record<BlockKey, string> = { today: 'Лимит на сегодня', accounts: 'Счета', recent: 'Последние операции' };
const today = new Date().toISOString().slice(0, 10);
const todayLabel = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date());
const formatMoney = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;
const accountColors = ['#d8f27a', '#9cc8ff', '#efb7ff', '#ffc978'];

const initialAccounts: Account[] = [
  { id: 'main', name: 'Основная карта', kind: 'Карта', balance: 84200, color: '#d8f27a' },
  { id: 'cash', name: 'Наличные', kind: 'Наличные', balance: 12600, color: '#9cc8ff' },
];
const initialOperations: Operation[] = [
  { id: '1', type: 'expense', title: 'Продукты', category: 'Еда', amount: 1860, accountId: 'main', date: today },
  { id: '2', type: 'expense', title: 'Метро', category: 'Транспорт', amount: 620, accountId: 'cash', date: today },
  { id: '3', type: 'income', title: 'Зарплата', category: 'Доход', amount: 100000, accountId: 'main', date: today },
];

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [operations, setOperations] = useState<Operation[]>(initialOperations);
  const [tab, setTab] = useState<'home' | 'operations' | 'goals' | 'more'>('home');
  const [modal, setModal] = useState<OperationType | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [visibleBlocks, setVisibleBlocks] = useState<Record<BlockKey, boolean>>(defaultBlocks);
  const [dailyTemplatePath, setDailyTemplatePath] = useState('templates/daily-note.md');
  const [dailyFolderPath, setDailyFolderPath] = useState('periodic/daily');
  const [vault, setVault] = useState<VaultConfig>({});
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [debts, setDebts] = useState<Debt[]>([]);
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const [goals, setGoals] = useState<Goal[]>([]);
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.accounts) setAccounts(parsed.accounts);
        if (parsed.operations) setOperations(parsed.operations);
      } catch { /* ignore malformed local state */ }
    });
    AsyncStorage.getItem(VAULT_KEY).then((raw) => { if (!raw) return; try { setVault(JSON.parse(raw)); } catch { /* ignore */ } });
    AsyncStorage.getItem('finora-categories').then((raw) => { if (!raw) return; try { setCategories(JSON.parse(raw)); } catch { /* ignore */ } });
    AsyncStorage.getItem('finora-debts').then((raw) => { if (!raw) return; try { setDebts(JSON.parse(raw)); } catch { /* ignore */ } });
    AsyncStorage.getItem(GOALS_KEY).then((raw) => { if (!raw) return; try { setGoals(JSON.parse(raw)); } catch { /* ignore */ } });
    AsyncStorage.getItem(TEMPLATES_KEY).then((raw) => { if (!raw) return; try { setTemplates(JSON.parse(raw)); } catch { /* ignore */ } });
    AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.visibleBlocks) setVisibleBlocks({ ...defaultBlocks, ...parsed.visibleBlocks });
        if (parsed.dailyTemplatePath) setDailyTemplatePath(parsed.dailyTemplatePath);
        if (parsed.dailyFolderPath) setDailyFolderPath(parsed.dailyFolderPath);
      } catch { /* ignore malformed settings */ }
    });
    NavigationBar.setVisibilityAsync('hidden').catch(() => undefined);
  }, []);

  useEffect(() => {
    contentOpacity.setValue(0);
    Animated.timing(contentOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [tab, contentOpacity]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ accounts, operations })).catch(() => undefined);
  }, [accounts, operations]);

  useEffect(() => {
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ visibleBlocks, dailyTemplatePath, dailyFolderPath })).catch(() => undefined);
    AsyncStorage.setItem(VAULT_KEY, JSON.stringify(vault)).catch(() => undefined);
    AsyncStorage.setItem('finora-categories', JSON.stringify(categories)).catch(() => undefined);
    AsyncStorage.setItem('finora-debts', JSON.stringify(debts)).catch(() => undefined);
    AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals)).catch(() => undefined);
    AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates)).catch(() => undefined);
  }, [visibleBlocks, dailyTemplatePath, dailyFolderPath, vault, categories, debts, goals, templates]);

  const total = useMemo(() => accounts.reduce((sum, account) => sum + account.balance, 0), [accounts]);
  const todayExpenses = operations.filter((item) => item.type === 'expense' && item.date === today).reduce((sum, item) => sum + item.amount, 0);
  const dayBudget = Math.max(0, Math.round((100000 - 32000 - 18000) / 30));
  const availableToday = Math.max(0, dayBudget - todayExpenses);
  const recent = operations.filter((item) => item.date === today).slice(0, 5);

  const submitOperation = async () => {
    const numericAmount = Number(amount.replace(',', '.'));
    if (!title.trim() || !numericAmount || numericAmount < 0) {
      Alert.alert('Проверьте данные', 'Добавьте название и корректную сумму.');
      return;
    }
    setSaving(true);
    const account = accounts[0];
    const operation: Operation = {
      id: `${Date.now()}`,
      type: modal || 'expense',
      title: title.trim(),
      category: category.trim() || (modal === 'income' ? 'Доход' : 'Без категории'),
      amount: numericAmount,
      accountId: account.id,
      date: today,
    };
    setOperations((current) => [operation, ...current]);
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, balance: item.balance + (operation.type === 'income' ? numericAmount : -numericAmount) } : item));
    try {
      const result = await writeOperationToDailyNote(vault, today, operation);
      Alert.alert('Сохранено', `${result.fileName} обновлена${result.created ? ' по шаблону' : ''}.`);
    } catch (error) {
      Alert.alert('Не записано в Obsidian', error instanceof Error ? error.message : 'Выберите папку daily в настройках и повторите.');
    }
    setTitle(''); setAmount(''); setCategory(''); setModal(null); setSaving(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar hidden style="light" />
      <Animated.ScrollView style={{ opacity: contentOpacity }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>{todayLabel.toUpperCase()}</Text><Text style={styles.greeting}>Добрый вечер</Text></View>
          <Pressable style={styles.avatar} onPress={() => setTab('more')}><Text style={styles.avatarText}>Ф</Text></Pressable>
        </View>

        {tab === 'home' && <>
          <View style={styles.balanceCard}><Text style={styles.cardLabel}>ВСЕ СЧЕТА</Text><Text style={styles.balance}>{formatMoney(total)}</Text><View style={styles.cardFooter}><Text style={styles.mutedLight}>Обновлено только что</Text><Text style={styles.syncDot}>●  офлайн</Text></View></View>
          {visibleBlocks.today && <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Сегодня</Text><Pressable onPress={() => setTab('operations')}><Text style={styles.link}>Все операции</Text></Pressable></View><View style={styles.todayRow}><View><Text style={styles.todayLabel}>Можно потратить</Text><Text style={styles.todayAmount}>{formatMoney(availableToday)}</Text></View><View style={styles.progressCircle}><Text style={styles.progressText}>{Math.round((availableToday / dayBudget) * 100)}%</Text></View></View><Text style={styles.subtle}>Лимит на день · {formatMoney(dayBudget)}</Text></>}

          {visibleBlocks.accounts && <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Счета</Text><Pressable onPress={() => Alert.alert('Счета', 'Счета уже сохраняются локально. Расширенное редактирование добавим следующим модулем.') }><Text style={styles.plus}>＋</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountsRow}>{accounts.map((account) => <View key={account.id} style={[styles.accountCard, { backgroundColor: account.color }]}><View style={styles.accountTop}><Text style={styles.accountKind}>{account.kind}</Text><Text style={styles.accountIcon}>◒</Text></View><Text style={styles.accountName}>{account.name}</Text><Text style={styles.accountBalance}>{formatMoney(account.balance)}</Text></View>)}</ScrollView></>}

          {visibleBlocks.recent && <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Последние операции</Text><Text style={styles.subtle}>Сегодня</Text></View>{recent.map((item) => <OperationRow key={item.id} item={item} />)}</>}
        </>}

        {tab === 'operations' && <><Text style={styles.pageTitle}>Операции</Text><Text style={styles.pageSubtitle}>Только ваши движения денег</Text>{operations.map((item) => <OperationRow key={item.id} item={item} />)}</>}
        {tab === 'goals' && <Goals goals={goals} setGoals={setGoals} />}
        {tab === 'more' && <More visibleBlocks={visibleBlocks} setVisibleBlocks={setVisibleBlocks} dailyTemplatePath={dailyTemplatePath} setDailyTemplatePath={setDailyTemplatePath} dailyFolderPath={dailyFolderPath} setDailyFolderPath={setDailyFolderPath} vault={vault} setVault={setVault} categories={categories} setCategories={setCategories} debts={debts} setDebts={setDebts} templates={templates} setTemplates={setTemplates} />}
      </Animated.ScrollView>

      <View style={styles.bottomBar}><NavButton icon="⌂" label="Обзор" active={tab === 'home'} onPress={() => setTab('home')} /><NavButton icon="↕" label="Операции" active={tab === 'operations'} onPress={() => setTab('operations')} /><Pressable style={styles.fab} onPress={() => setModal('expense')}><Text style={styles.fabText}>＋</Text></Pressable><NavButton icon="◌" label="Цели" active={tab === 'goals'} onPress={() => setTab('goals')} /><NavButton icon="•••" label="Ещё" active={tab === 'more'} onPress={() => setTab('more')} /></View>

      <Modal visible={modal !== null} transparent animationType="slide" onRequestClose={() => setModal(null)}><View style={styles.modalBackdrop}><View style={styles.modal}><View style={styles.modalHandle} /><View style={styles.modalHeader}><Text style={styles.modalTitle}>{modal === 'income' ? 'Новый доход' : 'Новый расход'}</Text><Pressable onPress={() => setModal(null)}><Text style={styles.close}>×</Text></Pressable></View><View style={styles.typeSwitch}><Pressable style={[styles.typeButton, modal === 'expense' && styles.typeActive]} onPress={() => setModal('expense')}><Text style={modal === 'expense' ? styles.typeActiveText : styles.typeText}>Расход</Text></Pressable><Pressable style={[styles.typeButton, modal === 'income' && styles.typeActiveIncome]} onPress={() => setModal('income')}><Text style={modal === 'income' ? styles.typeActiveText : styles.typeText}>Доход</Text></Pressable></View><TextInput placeholder="Название" placeholderTextColor="#777d83" value={title} onChangeText={setTitle} style={styles.input} /><TextInput placeholder="Сумма" placeholderTextColor="#777d83" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={[styles.input, styles.amountInput]} /><TextInput placeholder="Категория (необязательно)" placeholderTextColor="#777d83" value={category} onChangeText={setCategory} style={styles.input} /><Pressable style={styles.saveButton} onPress={submitOperation} disabled={saving}><Text style={styles.saveText}>Сохранить в ежедневную заметку</Text></Pressable></View></View></Modal>
    </SafeAreaView>
  );
}

function OperationRow({ item }: { item: Operation }) { return <View style={styles.operation}><View style={[styles.operationIcon, { backgroundColor: item.type === 'income' ? '#d8f27a' : '#24282d' }]}><Text style={styles.operationIconText}>{item.type === 'income' ? '↗' : '↘'}</Text></View><View style={styles.operationInfo}><Text style={styles.operationTitle}>{item.title}</Text><Text style={styles.operationCategory}>{item.category}</Text></View><Text style={[styles.operationAmount, item.type === 'income' && styles.incomeAmount]}>{item.type === 'income' ? '+' : '−'}{formatMoney(item.amount)}</Text></View>; }
function NavButton({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) { return <Pressable style={styles.navButton} onPress={onPress}><Text style={[styles.navIcon, active && styles.navActive]}>{icon}</Text><Text style={[styles.navLabel, active && styles.navActive]}>{label}</Text></Pressable>; }
function Goals({ goals, setGoals }: { goals: Goal[]; setGoals: (value: Goal[]) => void }) {
  const [visible, setVisible] = useState(false); const [name, setName] = useState(''); const [target, setTarget] = useState(''); const [saved, setSaved] = useState(''); const [monthly, setMonthly] = useState('');
  const addGoal = () => { const targetValue = Number(target.replace(',', '.')); const savedValue = Number(saved.replace(',', '.')) || 0; if (!name.trim() || !targetValue || targetValue <= 0) { Alert.alert('Заполните цель', 'Укажите название и целевую сумму.'); return; } setGoals([{ id: String(Date.now()), name: name.trim(), target: targetValue, saved: savedValue, monthly: Number(monthly.replace(',', '.')) || undefined, color: goals.length % 2 ? '#9cc8ff' : '#d8f27a' }, ...goals]); setName(''); setTarget(''); setSaved(''); setMonthly(''); setVisible(false); };
  return <><View style={styles.pageHeaderRow}><View><Text style={styles.pageTitle}>Цели</Text><Text style={styles.pageSubtitle}>Ваши планы становятся ближе</Text></View><Pressable style={styles.headerAction} onPress={() => setVisible(true)}><Text style={styles.headerActionText}>＋</Text></Pressable></View>{goals.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyCardIcon}>✦</Text><Text style={styles.emptyCardTitle}>Создайте первую цель</Text><Text style={styles.emptyCardText}>Например, подушка безопасности или путешествие.</Text><Pressable style={styles.saveButton} onPress={() => setVisible(true)}><Text style={styles.saveText}>Добавить цель</Text></Pressable></View> : goals.map((goal) => { const progress = Math.min(100, Math.round((goal.saved / goal.target) * 100)); return <Pressable key={goal.id} style={styles.goalCard} onPress={() => Alert.alert(goal.name, `${formatMoney(goal.saved)} из ${formatMoney(goal.target)}`, [{ text: 'Закрыть', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => setGoals(goals.filter((item) => item.id !== goal.id)) }])}><View style={styles.goalTop}><Text style={[styles.goalIcon, { color: goal.color }]}>✦</Text><Text style={[styles.goalPercent, { color: goal.color }]}>{progress}%</Text></View><Text style={styles.goalName}>{goal.name}</Text><Text style={styles.goalSum}>{formatMoney(goal.saved)} <Text style={styles.goalMuted}>из {formatMoney(goal.target)}</Text></Text><View style={styles.goalTrack}><View style={[styles.goalFill, { width: `${progress}%`, backgroundColor: goal.color }]} /></View><Text style={styles.goalHint}>{goal.monthly ? `Пополнение ${formatMoney(goal.monthly)} в месяц` : `Ещё ${formatMoney(Math.max(0, goal.target - goal.saved))} до цели`}</Text></Pressable>; })}<Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}><View style={styles.modalBackdrop}><View style={styles.modal}><View style={styles.modalHandle} /><Text style={styles.modalTitle}>Новая цель</Text><TextInput placeholder="Название цели" placeholderTextColor="#777d83" value={name} onChangeText={setName} style={styles.input} /><TextInput placeholder="Целевая сумма" placeholderTextColor="#777d83" value={target} onChangeText={setTarget} keyboardType="decimal-pad" style={styles.input} /><TextInput placeholder="Уже накоплено · необязательно" placeholderTextColor="#777d83" value={saved} onChangeText={setSaved} keyboardType="decimal-pad" style={styles.input} /><TextInput placeholder="Пополнение в месяц · необязательно" placeholderTextColor="#777d83" value={monthly} onChangeText={setMonthly} keyboardType="decimal-pad" style={styles.input} /><Pressable style={styles.saveButton} onPress={addGoal}><Text style={styles.saveText}>Создать цель</Text></Pressable></View></View></Modal></>;
}
function More({ visibleBlocks, setVisibleBlocks, dailyTemplatePath, setDailyTemplatePath, dailyFolderPath, setDailyFolderPath, vault, setVault, categories, setCategories, debts, setDebts, templates, setTemplates }: { visibleBlocks: Record<BlockKey, boolean>; setVisibleBlocks: (value: Record<BlockKey, boolean>) => void; dailyTemplatePath: string; setDailyTemplatePath: (value: string) => void; dailyFolderPath: string; setDailyFolderPath: (value: string) => void; vault: VaultConfig; setVault: (value: VaultConfig) => void; categories: string[]; setCategories: (value: string[]) => void; debts: Debt[]; setDebts: (value: Debt[]) => void; templates: RecurringTemplate[]; setTemplates: (value: RecurringTemplate[]) => void }) {
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [editingFolder, setEditingFolder] = useState(false);
  const [draft, setDraft] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [debtModal, setDebtModal] = useState(false);
  const [debtPerson, setDebtPerson] = useState('');
  const [debtTitle, setDebtTitle] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDirection, setDebtDirection] = useState<'owed' | 'receivable'>('owed');
  const [debtDueDate, setDebtDueDate] = useState('');
  const [templateModal, setTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateAmount, setTemplateAmount] = useState('');
  const [templateCategory, setTemplateCategory] = useState('');
  const [templateSchedule, setTemplateSchedule] = useState('Ежемесячно, 1 числа');
  const [templateType, setTemplateType] = useState<'expense' | 'income'>('expense');
  const connectFolder = async () => {
    try { const uri = await requestDailyFolder(); if (uri) { setVault({ ...vault, dailyDirectoryUri: uri }); Alert.alert('Папка подключена', 'Теперь операции можно записывать в ежедневные заметки.'); } } catch (error) { Alert.alert('Нет доступа', error instanceof Error ? error.message : 'Android не выдал доступ к папке.'); }
  };
  const connectTemplate = async () => {
    try { const uri = await requestTemplateFile(); if (uri) { setVault({ ...vault, templateFileUri: uri }); setDailyTemplatePath('выбранный шаблон'); Alert.alert('Шаблон подключён', 'Новые ежедневные заметки будут создаваться на его основе.'); } } catch (error) { Alert.alert('Не удалось выбрать файл', error instanceof Error ? error.message : 'Повторите попытку.'); }
  };
  const testConnection = async () => { try { await testVaultAccess(vault); Alert.alert('Доступ работает', 'Finora может читать и записывать выбранную папку.'); } catch { Alert.alert('Нужен доступ', 'Выберите папку periodic/daily через кнопку подключения.'); } };
  const addCategory = () => { const value = newCategory.trim(); if (!value || categories.includes(value)) return; setCategories([...categories, value]); setNewCategory(''); };
  const addDebt = () => { const amount = Number(debtAmount.replace(',', '.')); if (!debtPerson.trim() || !debtTitle.trim() || !amount) { Alert.alert('Заполните долг', 'Укажите человека, назначение и сумму.'); return; } setDebts([{ id: String(Date.now()), person: debtPerson.trim(), title: debtTitle.trim(), amount, remaining: amount, direction: debtDirection, dueDate: debtDueDate || undefined, reminder: Boolean(debtDueDate) }, ...debts]); setDebtPerson(''); setDebtTitle(''); setDebtAmount(''); setDebtDueDate(''); setDebtModal(false); };
  const addTemplate = () => { const value = Number(templateAmount.replace(',', '.')); if (!templateName.trim() || !templateCategory.trim()) { Alert.alert('Заполните шаблон', 'Укажите название и категорию.'); return; } setTemplates([{ id: String(Date.now()), name: templateName.trim(), type: templateType, amount: value || undefined, category: templateCategory.trim(), schedule: templateSchedule.trim() || 'Без расписания', enabled: true }, ...templates]); setTemplateName(''); setTemplateAmount(''); setTemplateCategory(''); setTemplateModal(false); };
  return <><Text style={styles.pageTitle}>Настройки</Text><Text style={styles.pageSubtitle}>Данные хранятся на устройстве и в выбранном vault</Text>
    <Text style={styles.settingsHeading}>Obsidian · доступ к файлам</Text><View style={styles.connectionCard}><Text style={styles.connectionTitle}>{vault.dailyDirectoryUri ? '● Папка подключена' : '○ Папка не подключена'}</Text><Text style={styles.connectionText}>{vault.dailyDirectoryUri ? 'Разрешение Android сохранено для Finora.' : 'Нажмите подключить и выберите папку periodic/daily в системном окне Android.'}</Text><View style={styles.connectionActions}><Pressable style={styles.smallButton} onPress={connectFolder}><Text style={styles.smallButtonText}>{vault.dailyDirectoryUri ? 'Сменить папку' : 'Подключить папку'}</Text></Pressable><Pressable style={styles.smallButtonSecondary} onPress={testConnection}><Text style={styles.smallButtonSecondaryText}>Проверить</Text></Pressable></View></View><Pressable style={styles.settingRow} onPress={connectTemplate}><View style={styles.settingIcon}><Text>⌘</Text></View><View style={styles.settingText}><Text style={styles.settingText}>Шаблон ежедневной заметки</Text><Text style={styles.settingValue}>{dailyTemplatePath}</Text></View><Text style={styles.chevron}>›</Text></Pressable>
    <Text style={styles.settingsHeading}>Главный экран</Text>{(Object.keys(blockLabels) as BlockKey[]).map((key) => <Pressable style={styles.settingRow} key={key} onPress={() => setVisibleBlocks({ ...visibleBlocks, [key]: !visibleBlocks[key] })}><View style={styles.settingIcon}><Text>{visibleBlocks[key] ? '✓' : '−'}</Text></View><Text style={styles.settingText}>{blockLabels[key]}</Text><Text style={[styles.toggle, visibleBlocks[key] && styles.toggleOn]}>{visibleBlocks[key] ? 'Показывать' : 'Скрыто'}</Text></Pressable>)}
    <Text style={styles.settingsHeading}>Категории</Text><View style={styles.inlineForm}><TextInput value={newCategory} onChangeText={setNewCategory} placeholder="Новая категория" placeholderTextColor="#777d83" style={styles.inlineInput} /><Pressable style={styles.inlineAdd} onPress={addCategory}><Text style={styles.inlineAddText}>＋</Text></Pressable></View><View style={styles.chips}>{categories.map((item) => <View style={styles.chip} key={item}><Text style={styles.chipText}>{item}</Text></View>)}</View>
    <Text style={styles.settingsHeading}>Долги</Text><Pressable style={styles.addDebtButton} onPress={() => setDebtModal(true)}><Text style={styles.addDebtText}>＋ Добавить долг</Text></Pressable>{debts.length === 0 ? <Text style={styles.emptyText}>Долгов пока нет</Text> : debts.map((debt) => <Pressable style={styles.debtRow} key={debt.id} onPress={() => Alert.alert('Долг', `${debt.person}: ${formatMoney(debt.remaining)}`, [{ text: 'Закрыть', style: 'cancel' }, { text: 'Отметить погашенным', onPress: () => setDebts(debts.map((item) => item.id === debt.id ? { ...item, remaining: 0 } : item)) }])}><View style={styles.debtIcon}><Text>{debt.direction === 'owed' ? '↘' : '↗'}</Text></View><View style={styles.settingText}><Text style={styles.debtTitle}>{debt.person} · {debt.title}</Text><Text style={styles.settingValue}>{debt.direction === 'owed' ? 'Я должен' : 'Мне должны'}{debt.dueDate ? ` · до ${debt.dueDate}` : ''}</Text></View><Text style={styles.debtAmount}>{formatMoney(debt.remaining)}</Text></Pressable>)}
    <Text style={styles.settingsHeading}>Шаблоны операций</Text><Text style={styles.sectionDescription}>Регулярные расходы и доходы, которые можно настроить один раз.</Text><Pressable style={styles.addDebtButton} onPress={() => setTemplateModal(true)}><Text style={styles.addDebtText}>＋ Создать шаблон</Text></Pressable>{templates.length === 0 ? <Text style={styles.emptyText}>Шаблонов пока нет</Text> : templates.map((item) => <Pressable style={styles.templateRow} key={item.id} onPress={() => Alert.alert(item.name, `${item.schedule}${item.amount ? ` · ${formatMoney(item.amount)}` : ' · сумма при списании'}`, [{ text: 'Закрыть', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => setTemplates(templates.filter((template) => template.id !== item.id)) }])}><View style={styles.debtIcon}><Text>{item.type === 'expense' ? '↘' : '↗'}</Text></View><View style={styles.settingText}><Text style={styles.debtTitle}>{item.name}</Text><Text style={styles.settingValue}>{item.category} · {item.schedule}</Text></View><Text style={styles.toggle}>{item.amount ? formatMoney(item.amount) : 'сумма позже'}</Text></Pressable>)}
    <Text style={styles.settingsHeading}>Общие</Text><View style={styles.settingRow}><View style={styles.settingIcon}><Text>◐</Text></View><Text style={styles.settingText}>Тема интерфейса</Text><Text style={styles.toggle}>Авто</Text></View><View style={styles.privacy}><Text style={styles.privacyTitle}>Локально и приватно</Text><Text style={styles.privacyText}>Без аккаунта, рекламы, Google Analytics и облачной синхронизации. Ваш vault остаётся вашим.</Text></View>
    <Modal visible={templateModal} transparent animationType="slide" onRequestClose={() => setTemplateModal(false)}><View style={styles.modalBackdrop}><View style={styles.modal}><View style={styles.modalHandle} /><Text style={styles.modalTitle}>Новый шаблон</Text><View style={styles.typeSwitch}><Pressable style={[styles.typeButton, templateType === 'expense' && styles.typeActive]} onPress={() => setTemplateType('expense')}><Text style={templateType === 'expense' ? styles.typeActiveText : styles.typeText}>Расход</Text></Pressable><Pressable style={[styles.typeButton, templateType === 'income' && styles.typeActiveIncome]} onPress={() => setTemplateType('income')}><Text style={templateType === 'income' ? styles.typeActiveText : styles.typeText}>Доход</Text></Pressable></View><TextInput placeholder="Название шаблона" placeholderTextColor="#777d83" value={templateName} onChangeText={setTemplateName} style={styles.input} /><TextInput placeholder="Категория" placeholderTextColor="#777d83" value={templateCategory} onChangeText={setTemplateCategory} style={styles.input} /><TextInput placeholder="Сумма · необязательно" placeholderTextColor="#777d83" value={templateAmount} onChangeText={setTemplateAmount} keyboardType="decimal-pad" style={styles.input} /><TextInput placeholder="Расписание" placeholderTextColor="#777d83" value={templateSchedule} onChangeText={setTemplateSchedule} style={styles.input} /><Pressable style={styles.saveButton} onPress={addTemplate}><Text style={styles.saveText}>Создать шаблон</Text></Pressable></View></View></Modal>
    <Modal visible={debtModal} transparent animationType="slide" onRequestClose={() => setDebtModal(false)}><View style={styles.modalBackdrop}><View style={styles.modal}><View style={styles.modalHandle} /><Text style={styles.modalTitle}>Новый долг</Text><View style={styles.typeSwitch}><Pressable style={[styles.typeButton, debtDirection === 'owed' && styles.typeActive]} onPress={() => setDebtDirection('owed')}><Text style={debtDirection === 'owed' ? styles.typeActiveText : styles.typeText}>Я должен</Text></Pressable><Pressable style={[styles.typeButton, debtDirection === 'receivable' && styles.typeActiveIncome]} onPress={() => setDebtDirection('receivable')}><Text style={debtDirection === 'receivable' ? styles.typeActiveText : styles.typeText}>Мне должны</Text></Pressable></View><TextInput placeholder="Человек" placeholderTextColor="#777d83" value={debtPerson} onChangeText={setDebtPerson} style={styles.input} /><TextInput placeholder="За что" placeholderTextColor="#777d83" value={debtTitle} onChangeText={setDebtTitle} style={styles.input} /><TextInput placeholder="Сумма" placeholderTextColor="#777d83" value={debtAmount} onChangeText={setDebtAmount} keyboardType="decimal-pad" style={styles.input} /><TextInput placeholder="Дата возврата · необязательно" placeholderTextColor="#777d83" value={debtDueDate} onChangeText={setDebtDueDate} style={styles.input} /><Pressable style={styles.saveButton} onPress={addDebt}><Text style={styles.saveText}>Сохранить долг</Text></Pressable></View></View></Modal>
  </>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#101214' }, container: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 120 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }, eyebrow: { color: '#7e858b', fontSize: 11, letterSpacing: 1.5, fontWeight: '700' }, greeting: { color: '#f4f4f0', fontSize: 28, fontWeight: '700', marginTop: 5 }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#d8f27a', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#11140f', fontSize: 17, fontWeight: '800' }, balanceCard: { backgroundColor: '#20252a', borderRadius: 24, padding: 22, marginBottom: 28 }, cardLabel: { color: '#91989e', fontSize: 11, letterSpacing: 1.4, fontWeight: '700' }, balance: { color: '#fff', fontSize: 38, fontWeight: '800', letterSpacing: -1, marginTop: 8 }, cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 }, mutedLight: { color: '#81888e', fontSize: 12 }, syncDot: { color: '#d8f27a', fontSize: 12, fontWeight: '600' }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, marginTop: 4 }, sectionTitle: { color: '#f4f4f0', fontSize: 19, fontWeight: '700' }, link: { color: '#d8f27a', fontWeight: '600', fontSize: 13 }, plus: { color: '#d8f27a', fontSize: 28, lineHeight: 28 }, todayRow: { backgroundColor: '#181b1e', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, todayLabel: { color: '#92999e', fontSize: 13 }, todayAmount: { color: '#f4f4f0', fontSize: 26, fontWeight: '800', marginTop: 7 }, progressCircle: { width: 58, height: 58, borderRadius: 29, borderWidth: 5, borderColor: '#d8f27a', alignItems: 'center', justifyContent: 'center' }, progressText: { color: '#d8f27a', fontSize: 12, fontWeight: '800' }, subtle: { color: '#747b81', fontSize: 12, marginTop: 8 }, accountsRow: { gap: 12, paddingBottom: 28 }, accountCard: { width: 174, borderRadius: 20, padding: 16 }, accountTop: { flexDirection: 'row', justifyContent: 'space-between' }, accountKind: { color: '#242820', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }, accountIcon: { color: '#242820', fontSize: 20 }, accountName: { color: '#242820', fontSize: 15, fontWeight: '700', marginTop: 28 }, accountBalance: { color: '#242820', fontSize: 21, fontWeight: '800', marginTop: 5 }, operation: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }, operationIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, operationIconText: { color: '#d8f27a', fontSize: 19, fontWeight: '800' }, operationInfo: { flex: 1, marginLeft: 12 }, operationTitle: { color: '#f4f4f0', fontSize: 15, fontWeight: '600' }, operationCategory: { color: '#7f868b', fontSize: 12, marginTop: 3 }, operationAmount: { color: '#f4f4f0', fontSize: 14, fontWeight: '700' }, incomeAmount: { color: '#d8f27a' }, pageTitle: { color: '#f4f4f0', fontSize: 32, fontWeight: '800', marginTop: 10 }, pageSubtitle: { color: '#7f868b', fontSize: 14, marginTop: 7, marginBottom: 28 }, bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 84, backgroundColor: '#181b1e', borderTopWidth: 1, borderTopColor: '#282d31', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 10 }, navButton: { alignItems: 'center', width: 64 }, navIcon: { color: '#70777d', fontSize: 22, height: 27 }, navLabel: { color: '#70777d', fontSize: 10, marginTop: 3 }, navActive: { color: '#d8f27a' }, fab: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#d8f27a', alignItems: 'center', justifyContent: 'center', marginTop: -28 }, fabText: { color: '#11140f', fontSize: 30, fontWeight: '300' }, modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.68)' }, modal: { backgroundColor: '#181b1e', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 36 }, modalHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#484e53', alignSelf: 'center', marginBottom: 18 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { color: '#f4f4f0', fontSize: 24, fontWeight: '800' }, close: { color: '#a8afb3', fontSize: 30 }, typeSwitch: { flexDirection: 'row', backgroundColor: '#24282d', borderRadius: 12, padding: 4, marginTop: 22 }, typeButton: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 9 }, typeActive: { backgroundColor: '#d8f27a' }, typeActiveIncome: { backgroundColor: '#9cc8ff' }, typeText: { color: '#9da4a9', fontWeight: '700' }, typeActiveText: { color: '#12150f', fontWeight: '800' }, input: { backgroundColor: '#24282d', borderRadius: 14, color: '#f4f4f0', paddingHorizontal: 16, paddingVertical: 15, marginTop: 14, fontSize: 15 }, amountInput: { fontSize: 24, fontWeight: '800' }, saveButton: { backgroundColor: '#d8f27a', paddingVertical: 17, borderRadius: 15, alignItems: 'center', marginTop: 22 }, saveText: { color: '#12150f', fontWeight: '800', fontSize: 15 }, goalCard: { backgroundColor: '#20252a', borderRadius: 22, padding: 20, marginBottom: 14 }, goalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, goalIcon: { color: '#d8f27a', fontSize: 26 }, goalPercent: { color: '#d8f27a', fontWeight: '800' }, goalName: { color: '#f4f4f0', fontSize: 18, fontWeight: '700', marginTop: 16 }, goalSum: { color: '#f4f4f0', fontSize: 16, fontWeight: '700', marginTop: 7 }, goalMuted: { color: '#7f868b', fontWeight: '400' }, goalTrack: { height: 7, backgroundColor: '#363c41', borderRadius: 4, marginTop: 18, overflow: 'hidden' }, goalFill: { height: '100%', backgroundColor: '#d8f27a', borderRadius: 4 }, goalHint: { color: '#8d959a', fontSize: 12, marginTop: 10 }, settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#282d31' }, settingIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#24282d', alignItems: 'center', justifyContent: 'center' }, settingText: { color: '#f4f4f0', fontSize: 15, marginLeft: 13, flex: 1 }, chevron: { color: '#6e767b', fontSize: 25 }, privacy: { backgroundColor: '#20252a', borderRadius: 18, padding: 17, marginTop: 28 }, privacyTitle: { color: '#d8f27a', fontSize: 14, fontWeight: '800' }, privacyText: { color: '#92999e', fontSize: 13, lineHeight: 19, marginTop: 8 }, settingsHeading: { color: '#7e858b', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 22, marginBottom: 4 }, settingValue: { color: '#7f868b', fontSize: 11, marginTop: 3 }, toggle: { color: '#70777d', fontSize: 11, fontWeight: '700' }, toggleOn: { color: '#d8f27a' }, modalHint: { color: '#858d92', fontSize: 13, marginTop: 8 }, connectionCard: { backgroundColor: '#20252a', borderRadius: 18, padding: 16, marginBottom: 8 }, connectionTitle: { color: '#d8f27a', fontSize: 15, fontWeight: '800' }, connectionText: { color: '#92999e', fontSize: 12, lineHeight: 18, marginTop: 7 }, connectionActions: { flexDirection: 'row', gap: 8, marginTop: 14 }, smallButton: { backgroundColor: '#d8f27a', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10 }, smallButtonText: { color: '#12150f', fontWeight: '800', fontSize: 12 }, smallButtonSecondary: { backgroundColor: '#30363b', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10 }, smallButtonSecondaryText: { color: '#f4f4f0', fontWeight: '700', fontSize: 12 }, inlineForm: { flexDirection: 'row', gap: 8, marginBottom: 10 }, inlineInput: { flex: 1, backgroundColor: '#24282d', borderRadius: 12, color: '#f4f4f0', paddingHorizontal: 14, paddingVertical: 12 }, inlineAdd: { width: 46, borderRadius: 12, backgroundColor: '#d8f27a', alignItems: 'center', justifyContent: 'center' }, inlineAddText: { color: '#12150f', fontSize: 25 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { backgroundColor: '#24282d', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 }, chipText: { color: '#c7cdd0', fontSize: 12 }, addDebtButton: { backgroundColor: '#24282d', borderRadius: 13, paddingVertical: 13, alignItems: 'center', marginBottom: 8 }, addDebtText: { color: '#d8f27a', fontWeight: '800' }, emptyText: { color: '#70777d', fontSize: 13, paddingVertical: 10 }, debtRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#282d31' }, debtIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#24282d', alignItems: 'center', justifyContent: 'center' }, debtTitle: { color: '#f4f4f0', fontSize: 14, fontWeight: '700' }, debtAmount: { color: '#f4f4f0', fontSize: 13, fontWeight: '800' }, pageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, headerAction: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#d8f27a', alignItems: 'center', justifyContent: 'center', marginTop: 10 }, headerActionText: { color: '#12150f', fontSize: 26 }, emptyCard: { backgroundColor: '#20252a', borderRadius: 22, padding: 22, marginTop: 8 }, emptyCardIcon: { color: '#d8f27a', fontSize: 30 }, emptyCardTitle: { color: '#f4f4f0', fontSize: 19, fontWeight: '800', marginTop: 12 }, emptyCardText: { color: '#92999e', fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 16 }, sectionDescription: { color: '#7f868b', fontSize: 12, lineHeight: 18, marginBottom: 10 }, templateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#282d31' }, 
});
