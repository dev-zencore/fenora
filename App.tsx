import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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

type OperationType = 'expense' | 'income' | 'transfer';
type Account = { id: string; name: string; kind: string; balance: number; color: string };
type Operation = { id: string; type: OperationType; title: string; category: string; amount: number; accountId: string; date: string };

const STORAGE_KEY = 'finora-state-v1';
const SETTINGS_KEY = 'finora-settings-v1';
type BlockKey = 'today' | 'accounts' | 'recent';
const defaultBlocks: Record<BlockKey, boolean> = { today: true, accounts: true, recent: true };
const blockLabels: Record<BlockKey, string> = { today: 'Лимит на сегодня', accounts: 'Счета', recent: 'Последние операции' };
const today = new Date().toISOString().slice(0, 10);
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

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.accounts) setAccounts(parsed.accounts);
        if (parsed.operations) setOperations(parsed.operations);
      } catch { /* ignore malformed local state */ }
    });
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
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ accounts, operations })).catch(() => undefined);
  }, [accounts, operations]);

  useEffect(() => {
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ visibleBlocks, dailyTemplatePath, dailyFolderPath })).catch(() => undefined);
  }, [visibleBlocks, dailyTemplatePath, dailyFolderPath]);

  const total = useMemo(() => accounts.reduce((sum, account) => sum + account.balance, 0), [accounts]);
  const todayExpenses = operations.filter((item) => item.type === 'expense' && item.date === today).reduce((sum, item) => sum + item.amount, 0);
  const dayBudget = Math.max(0, Math.round((100000 - 32000 - 18000) / 30));
  const availableToday = Math.max(0, dayBudget - todayExpenses);
  const recent = operations.filter((item) => item.date === today).slice(0, 5);

  const submitOperation = () => {
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
    setTitle(''); setAmount(''); setCategory(''); setModal(null); setSaving(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar hidden style="light" />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>ПЯТНИЦА, 02 ОКТЯБРЯ</Text><Text style={styles.greeting}>Добрый вечер</Text></View>
          <Pressable style={styles.avatar} onPress={() => setTab('more')}><Text style={styles.avatarText}>Ф</Text></Pressable>
        </View>

        {tab === 'home' && <>
          <View style={styles.balanceCard}><Text style={styles.cardLabel}>ВСЕ СЧЕТА</Text><Text style={styles.balance}>{formatMoney(total)}</Text><View style={styles.cardFooter}><Text style={styles.mutedLight}>Обновлено только что</Text><Text style={styles.syncDot}>●  офлайн</Text></View></View>
          {visibleBlocks.today && <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Сегодня</Text><Pressable onPress={() => setTab('operations')}><Text style={styles.link}>Все операции</Text></Pressable></View><View style={styles.todayRow}><View><Text style={styles.todayLabel}>Можно потратить</Text><Text style={styles.todayAmount}>{formatMoney(availableToday)}</Text></View><View style={styles.progressCircle}><Text style={styles.progressText}>{Math.round((availableToday / dayBudget) * 100)}%</Text></View></View><Text style={styles.subtle}>Лимит на день · {formatMoney(dayBudget)}</Text></>}

          {visibleBlocks.accounts && <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Счета</Text><Pressable onPress={() => Alert.alert('Счета', 'Счета уже сохраняются локально. Расширенное редактирование добавим следующим модулем.') }><Text style={styles.plus}>＋</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountsRow}>{accounts.map((account) => <View key={account.id} style={[styles.accountCard, { backgroundColor: account.color }]}><View style={styles.accountTop}><Text style={styles.accountKind}>{account.kind}</Text><Text style={styles.accountIcon}>◒</Text></View><Text style={styles.accountName}>{account.name}</Text><Text style={styles.accountBalance}>{formatMoney(account.balance)}</Text></View>)}</ScrollView></>}

          {visibleBlocks.recent && <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Последние операции</Text><Text style={styles.subtle}>Сегодня</Text></View>{recent.map((item) => <OperationRow key={item.id} item={item} />)}</>}
        </>}

        {tab === 'operations' && <><Text style={styles.pageTitle}>Операции</Text><Text style={styles.pageSubtitle}>Только ваши движения денег</Text>{operations.map((item) => <OperationRow key={item.id} item={item} />)}</>}
        {tab === 'goals' && <Goals />}
        {tab === 'more' && <More visibleBlocks={visibleBlocks} setVisibleBlocks={setVisibleBlocks} dailyTemplatePath={dailyTemplatePath} setDailyTemplatePath={setDailyTemplatePath} dailyFolderPath={dailyFolderPath} setDailyFolderPath={setDailyFolderPath} />}
      </ScrollView>

      <View style={styles.bottomBar}><NavButton icon="⌂" label="Обзор" active={tab === 'home'} onPress={() => setTab('home')} /><NavButton icon="↕" label="Операции" active={tab === 'operations'} onPress={() => setTab('operations')} /><Pressable style={styles.fab} onPress={() => setModal('expense')}><Text style={styles.fabText}>＋</Text></Pressable><NavButton icon="◌" label="Цели" active={tab === 'goals'} onPress={() => setTab('goals')} /><NavButton icon="•••" label="Ещё" active={tab === 'more'} onPress={() => setTab('more')} /></View>

      <Modal visible={modal !== null} transparent animationType="slide" onRequestClose={() => setModal(null)}><View style={styles.modalBackdrop}><View style={styles.modal}><View style={styles.modalHandle} /><View style={styles.modalHeader}><Text style={styles.modalTitle}>{modal === 'income' ? 'Новый доход' : 'Новый расход'}</Text><Pressable onPress={() => setModal(null)}><Text style={styles.close}>×</Text></Pressable></View><View style={styles.typeSwitch}><Pressable style={[styles.typeButton, modal === 'expense' && styles.typeActive]} onPress={() => setModal('expense')}><Text style={modal === 'expense' ? styles.typeActiveText : styles.typeText}>Расход</Text></Pressable><Pressable style={[styles.typeButton, modal === 'income' && styles.typeActiveIncome]} onPress={() => setModal('income')}><Text style={modal === 'income' ? styles.typeActiveText : styles.typeText}>Доход</Text></Pressable></View><TextInput placeholder="Название" placeholderTextColor="#777d83" value={title} onChangeText={setTitle} style={styles.input} /><TextInput placeholder="Сумма" placeholderTextColor="#777d83" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={[styles.input, styles.amountInput]} /><TextInput placeholder="Категория (необязательно)" placeholderTextColor="#777d83" value={category} onChangeText={setCategory} style={styles.input} /><Pressable style={styles.saveButton} onPress={submitOperation} disabled={saving}><Text style={styles.saveText}>Сохранить в ежедневную заметку</Text></Pressable></View></View></Modal>
    </SafeAreaView>
  );
}

function OperationRow({ item }: { item: Operation }) { return <View style={styles.operation}><View style={[styles.operationIcon, { backgroundColor: item.type === 'income' ? '#d8f27a' : '#24282d' }]}><Text style={styles.operationIconText}>{item.type === 'income' ? '↗' : '↘'}</Text></View><View style={styles.operationInfo}><Text style={styles.operationTitle}>{item.title}</Text><Text style={styles.operationCategory}>{item.category}</Text></View><Text style={[styles.operationAmount, item.type === 'income' && styles.incomeAmount]}>{item.type === 'income' ? '+' : '−'}{formatMoney(item.amount)}</Text></View>; }
function NavButton({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) { return <Pressable style={styles.navButton} onPress={onPress}><Text style={[styles.navIcon, active && styles.navActive]}>{icon}</Text><Text style={[styles.navLabel, active && styles.navActive]}>{label}</Text></Pressable>; }
function Goals() { return <><Text style={styles.pageTitle}>Цели</Text><Text style={styles.pageSubtitle}>Ваши планы становятся ближе</Text><View style={styles.goalCard}><View style={styles.goalTop}><Text style={styles.goalIcon}>⌂</Text><Text style={styles.goalPercent}>42%</Text></View><Text style={styles.goalName}>Подушка безопасности</Text><Text style={styles.goalSum}>84 000 ₽ <Text style={styles.goalMuted}>из 200 000 ₽</Text></Text><View style={styles.goalTrack}><View style={[styles.goalFill, { width: '42%' }]} /></View><Text style={styles.goalHint}>Ещё 116 000 ₽ до цели</Text></View><View style={styles.goalCard}><View style={styles.goalTop}><Text style={styles.goalIcon}>✦</Text><Text style={styles.goalPercent}>68%</Text></View><Text style={styles.goalName}>Путешествие</Text><Text style={styles.goalSum}>68 000 ₽ <Text style={styles.goalMuted}>из 100 000 ₽</Text></Text><View style={styles.goalTrack}><View style={[styles.goalFill, { width: '68%', backgroundColor: '#9cc8ff' }]} /></View><Text style={styles.goalHint}>Пополнение 5 000 ₽ в месяц</Text></View></>; }
function More({ visibleBlocks, setVisibleBlocks, dailyTemplatePath, setDailyTemplatePath, dailyFolderPath, setDailyFolderPath }: { visibleBlocks: Record<BlockKey, boolean>; setVisibleBlocks: (value: Record<BlockKey, boolean>) => void; dailyTemplatePath: string; setDailyTemplatePath: (value: string) => void; dailyFolderPath: string; setDailyFolderPath: (value: string) => void }) {
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [editingFolder, setEditingFolder] = useState(false);
  const [draft, setDraft] = useState('');
  const savePath = () => {
    if (editingTemplate) setDailyTemplatePath(draft);
    if (editingFolder) setDailyFolderPath(draft);
    setEditingTemplate(false); setEditingFolder(false);
  };
  return <><Text style={styles.pageTitle}>Настройки</Text><Text style={styles.pageSubtitle}>Работает локально · без аккаунта и трекеров</Text>
    <Text style={styles.settingsHeading}>Главный экран</Text>{(Object.keys(blockLabels) as BlockKey[]).map((key) => <Pressable style={styles.settingRow} key={key} onPress={() => setVisibleBlocks({ ...visibleBlocks, [key]: !visibleBlocks[key] })}><View style={styles.settingIcon}><Text>{visibleBlocks[key] ? '✓' : '−'}</Text></View><Text style={styles.settingText}>{blockLabels[key]}</Text><Text style={[styles.toggle, visibleBlocks[key] && styles.toggleOn]}>{visibleBlocks[key] ? 'Показывать' : 'Скрыто'}</Text></Pressable>)}
    <Text style={styles.settingsHeading}>Obsidian</Text><Pressable style={styles.settingRow} onPress={() => { setDraft(dailyTemplatePath); setEditingTemplate(true); }}><View style={styles.settingIcon}><Text>⌘</Text></View><View style={styles.settingText}><Text style={styles.settingText}>Шаблон daily note</Text><Text style={styles.settingValue}>{dailyTemplatePath}</Text></View><Text style={styles.chevron}>›</Text></Pressable><Pressable style={styles.settingRow} onPress={() => { setDraft(dailyFolderPath); setEditingFolder(true); }}><View style={styles.settingIcon}><Text>▣</Text></View><View style={styles.settingText}><Text style={styles.settingText}>Папка daily</Text><Text style={styles.settingValue}>{dailyFolderPath}</Text></View><Text style={styles.chevron}>›</Text></Pressable>
    <Text style={styles.settingsHeading}>Прочее</Text><View style={styles.settingRow}><View style={styles.settingIcon}><Text>◐</Text></View><Text style={styles.settingText}>Тема интерфейса</Text><Text style={styles.toggle}>Авто</Text></View><View style={styles.privacy}><Text style={styles.privacyTitle}>Локально и приватно</Text><Text style={styles.privacyText}>Без аккаунта, рекламы, Google Analytics и облачной синхронизации. Ваш vault остаётся вашим.</Text></View>
    <Modal visible={editingTemplate || editingFolder} transparent animationType="slide" onRequestClose={() => { setEditingTemplate(false); setEditingFolder(false); }}><View style={styles.modalBackdrop}><View style={styles.modal}><View style={styles.modalHandle} /><Text style={styles.modalTitle}>{editingTemplate ? 'Файл шаблона' : 'Папка ежедневных заметок'}</Text><Text style={styles.modalHint}>Путь сохраняется только на этом устройстве.</Text><TextInput value={draft} onChangeText={setDraft} autoCapitalize="none" autoCorrect={false} placeholderTextColor="#777d83" style={styles.input} /><Pressable style={styles.saveButton} onPress={savePath}><Text style={styles.saveText}>Сохранить настройку</Text></Pressable></View></View></Modal>
  </>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#101214' }, container: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 120 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }, eyebrow: { color: '#7e858b', fontSize: 11, letterSpacing: 1.5, fontWeight: '700' }, greeting: { color: '#f4f4f0', fontSize: 28, fontWeight: '700', marginTop: 5 }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#d8f27a', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#11140f', fontSize: 17, fontWeight: '800' }, balanceCard: { backgroundColor: '#20252a', borderRadius: 24, padding: 22, marginBottom: 28 }, cardLabel: { color: '#91989e', fontSize: 11, letterSpacing: 1.4, fontWeight: '700' }, balance: { color: '#fff', fontSize: 38, fontWeight: '800', letterSpacing: -1, marginTop: 8 }, cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 }, mutedLight: { color: '#81888e', fontSize: 12 }, syncDot: { color: '#d8f27a', fontSize: 12, fontWeight: '600' }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, marginTop: 4 }, sectionTitle: { color: '#f4f4f0', fontSize: 19, fontWeight: '700' }, link: { color: '#d8f27a', fontWeight: '600', fontSize: 13 }, plus: { color: '#d8f27a', fontSize: 28, lineHeight: 28 }, todayRow: { backgroundColor: '#181b1e', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, todayLabel: { color: '#92999e', fontSize: 13 }, todayAmount: { color: '#f4f4f0', fontSize: 26, fontWeight: '800', marginTop: 7 }, progressCircle: { width: 58, height: 58, borderRadius: 29, borderWidth: 5, borderColor: '#d8f27a', alignItems: 'center', justifyContent: 'center' }, progressText: { color: '#d8f27a', fontSize: 12, fontWeight: '800' }, subtle: { color: '#747b81', fontSize: 12, marginTop: 8 }, accountsRow: { gap: 12, paddingBottom: 28 }, accountCard: { width: 174, borderRadius: 20, padding: 16 }, accountTop: { flexDirection: 'row', justifyContent: 'space-between' }, accountKind: { color: '#242820', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }, accountIcon: { color: '#242820', fontSize: 20 }, accountName: { color: '#242820', fontSize: 15, fontWeight: '700', marginTop: 28 }, accountBalance: { color: '#242820', fontSize: 21, fontWeight: '800', marginTop: 5 }, operation: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }, operationIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, operationIconText: { color: '#d8f27a', fontSize: 19, fontWeight: '800' }, operationInfo: { flex: 1, marginLeft: 12 }, operationTitle: { color: '#f4f4f0', fontSize: 15, fontWeight: '600' }, operationCategory: { color: '#7f868b', fontSize: 12, marginTop: 3 }, operationAmount: { color: '#f4f4f0', fontSize: 14, fontWeight: '700' }, incomeAmount: { color: '#d8f27a' }, pageTitle: { color: '#f4f4f0', fontSize: 32, fontWeight: '800', marginTop: 10 }, pageSubtitle: { color: '#7f868b', fontSize: 14, marginTop: 7, marginBottom: 28 }, bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 84, backgroundColor: '#181b1e', borderTopWidth: 1, borderTopColor: '#282d31', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 10 }, navButton: { alignItems: 'center', width: 64 }, navIcon: { color: '#70777d', fontSize: 22, height: 27 }, navLabel: { color: '#70777d', fontSize: 10, marginTop: 3 }, navActive: { color: '#d8f27a' }, fab: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#d8f27a', alignItems: 'center', justifyContent: 'center', marginTop: -28 }, fabText: { color: '#11140f', fontSize: 30, fontWeight: '300' }, modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.68)' }, modal: { backgroundColor: '#181b1e', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 36 }, modalHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#484e53', alignSelf: 'center', marginBottom: 18 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { color: '#f4f4f0', fontSize: 24, fontWeight: '800' }, close: { color: '#a8afb3', fontSize: 30 }, typeSwitch: { flexDirection: 'row', backgroundColor: '#24282d', borderRadius: 12, padding: 4, marginTop: 22 }, typeButton: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 9 }, typeActive: { backgroundColor: '#d8f27a' }, typeActiveIncome: { backgroundColor: '#9cc8ff' }, typeText: { color: '#9da4a9', fontWeight: '700' }, typeActiveText: { color: '#12150f', fontWeight: '800' }, input: { backgroundColor: '#24282d', borderRadius: 14, color: '#f4f4f0', paddingHorizontal: 16, paddingVertical: 15, marginTop: 14, fontSize: 15 }, amountInput: { fontSize: 24, fontWeight: '800' }, saveButton: { backgroundColor: '#d8f27a', paddingVertical: 17, borderRadius: 15, alignItems: 'center', marginTop: 22 }, saveText: { color: '#12150f', fontWeight: '800', fontSize: 15 }, goalCard: { backgroundColor: '#20252a', borderRadius: 22, padding: 20, marginBottom: 14 }, goalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, goalIcon: { color: '#d8f27a', fontSize: 26 }, goalPercent: { color: '#d8f27a', fontWeight: '800' }, goalName: { color: '#f4f4f0', fontSize: 18, fontWeight: '700', marginTop: 16 }, goalSum: { color: '#f4f4f0', fontSize: 16, fontWeight: '700', marginTop: 7 }, goalMuted: { color: '#7f868b', fontWeight: '400' }, goalTrack: { height: 7, backgroundColor: '#363c41', borderRadius: 4, marginTop: 18, overflow: 'hidden' }, goalFill: { height: '100%', backgroundColor: '#d8f27a', borderRadius: 4 }, goalHint: { color: '#8d959a', fontSize: 12, marginTop: 10 }, settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#282d31' }, settingIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#24282d', alignItems: 'center', justifyContent: 'center' }, settingText: { color: '#f4f4f0', fontSize: 15, marginLeft: 13, flex: 1 }, chevron: { color: '#6e767b', fontSize: 25 }, privacy: { backgroundColor: '#20252a', borderRadius: 18, padding: 17, marginTop: 28 }, privacyTitle: { color: '#d8f27a', fontSize: 14, fontWeight: '800' }, privacyText: { color: '#92999e', fontSize: 13, lineHeight: 19, marginTop: 8 }, settingsHeading: { color: '#7e858b', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 22, marginBottom: 4 }, settingValue: { color: '#7f868b', fontSize: 11, marginTop: 3 }, toggle: { color: '#70777d', fontSize: 11, fontWeight: '700' }, toggleOn: { color: '#d8f27a' }, modalHint: { color: '#858d92', fontSize: 13, marginTop: 8 },
});
