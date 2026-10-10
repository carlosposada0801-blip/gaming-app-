import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PARTNERS, PARTNER_IDS, type PartnerId } from '../game/partners';
import { isUnlocked, type Profile } from '../game/profile';
import { formatFt } from '../game/route';
import { ROUTES, ROUTE_IDS, type RouteId } from '../game/routes';
import { SEASONS, SEASON_IDS, type Season } from '../game/season';
import type { Mode } from '../game/types';
import { C, NUM } from './theme';

export interface Plan {
  route: RouteId;
  season: Season;
  partner: PartnerId;
  mode: Mode;
  /** Empty = a fresh random seed when you start. */
  seed: string;
  daily: boolean;
}

const MODES: { id: Mode; label: string; what: string }[] = [
  { id: 'standard', label: 'Standard', what: 'Your calls, your gear, your rope partner.' },
  { id: 'guided', label: 'Guided', what: 'A guide rents you missing gear, points out the safe choice and turns the team around. Scores x0.6.' },
  { id: 'hardcore', label: 'Hardcore', what: 'No dice to fall back on. A bad ending ends your streak. Scores x1.5.' },
];

const GRADE = ['', 'Standard', 'Standard, long', 'Steep ice', 'Expert'];

export function PlanScreen({
  plan,
  setPlan,
  profile,
  onNext,
  onBack,
}: {
  plan: Plan;
  setPlan: (p: Plan) => void;
  profile: Profile;
  onNext: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const set = (patch: Partial<Plan>) => setPlan({ ...plan, ...patch, daily: false });
  const routeOk = isUnlocked(profile, plan.route);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 120 + insets.bottom }}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>{'‹'} Back</Text>
        </Pressable>
        <Text style={styles.h1}>Plan your climb</Text>

        <Text style={styles.section}>ROUTE</Text>
        {ROUTE_IDS.map((id) => {
          const r = ROUTES[id];
          const open = isUnlocked(profile, id);
          const on = plan.route === id;
          const gain = r.nodes[r.nodes.length - 1].ft - r.nodes[0].ft;
          return (
            <Pressable
              key={id}
              disabled={!open}
              onPress={() => set({ route: id })}
              style={[styles.card, on && styles.cardOn, !open && { opacity: 0.5 }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: !open }}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{r.name}</Text>
                <Text style={[styles.grade, r.grade === 4 && { color: C.bad }]}>{GRADE[r.grade]}</Text>
              </View>
              <Text style={[styles.cardSub, NUM]}>
                {r.nodes[0].name} · {formatFt(gain)} of gain · high camp {r.nodes[r.camp].name}
              </Text>
              <Text style={styles.cardBody}>{open ? r.blurb : `Locked. ${r.unlock}`}</Text>
            </Pressable>
          );
        })}

        <Text style={styles.section}>SEASON</Text>
        <View style={styles.chips}>
          {SEASON_IDS.map((id) => (
            <Pressable
              key={id}
              onPress={() => set({ season: id })}
              style={[styles.chip, plan.season === id && styles.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: plan.season === id }}
            >
              <Text style={[styles.chipText, plan.season === id && styles.chipTextOn]}>{SEASONS[id].label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.cardBody}>{SEASONS[plan.season].blurb}</Text>

        <Text style={styles.section}>MODE</Text>
        <View style={styles.chips}>
          {MODES.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => set({ mode: m.id })}
              style={[styles.chip, plan.mode === m.id && styles.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: plan.mode === m.id }}
            >
              <Text style={[styles.chipText, plan.mode === m.id && styles.chipTextOn]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.cardBody}>
          {MODES.find((m) => m.id === plan.mode)?.what}
          {plan.mode === 'hardcore' ? ` Current streak ${profile.hardcore.streak}, best ${profile.hardcore.best}.` : ''}
        </Text>

        <Text style={styles.section}>ROPE PARTNER</Text>
        {plan.mode === 'guided' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{PARTNERS.guide.name}</Text>
            <Text style={styles.cardBody}>{PARTNERS.guide.blurb}</Text>
          </View>
        ) : (
          PARTNER_IDS.map((id) => {
            const p = PARTNERS[id];
            const on = plan.partner === id;
            return (
              <Pressable
                key={id}
                onPress={() => set({ partner: id })}
                style={[styles.card, on && styles.cardOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={styles.cardTitle}>{p.name} · <Text style={styles.cardSubInline}>{p.title}</Text></Text>
                <Text style={styles.cardBody}>{p.blurb}</Text>
              </Pressable>
            );
          })
        )}

        <Text style={styles.section}>SEED</Text>
        <Text style={styles.cardBody}>
          Same seed, same forecast and the same dice for the same choices. Share one to race a friend. Leave it empty for a new climb.
        </Text>
        <TextInput
          value={plan.seed}
          onChangeText={(t) => setPlan({ ...plan, seed: t.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20), daily: false })}
          placeholder="Random"
          placeholderTextColor={C.faint}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[styles.input, NUM]}
          accessibilityLabel="Seed"
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        <Pressable
          style={[styles.start, !routeOk && { opacity: 0.4 }]}
          disabled={!routeOk}
          onPress={onNext}
          accessibilityRole="button"
        >
          <Text style={styles.startText}>Pack your gear</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  back: { color: C.ice, fontSize: 15, paddingVertical: 6 },
  h1: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  section: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginTop: 8 },
  card: { backgroundColor: C.panel, borderRadius: 14, padding: 14, gap: 5, borderWidth: 1, borderColor: C.line },
  cardOn: { borderColor: C.accent },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  cardSub: { color: C.ice, fontSize: 12, fontWeight: '600' },
  cardSubInline: { color: C.muted, fontSize: 13, fontWeight: '600' },
  cardBody: { color: C.muted, fontSize: 13, lineHeight: 18 },
  grade: { color: C.warn, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontSize: 14, fontWeight: '700' },
  chipTextOn: { color: '#1a0b03' },
  input: {
    backgroundColor: C.panel, borderRadius: 10, borderWidth: 1, borderColor: C.line, color: C.text, fontSize: 18,
    fontWeight: '700', paddingHorizontal: 14, paddingVertical: 10, letterSpacing: 2,
  },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 10, backgroundColor: C.panel,
    borderTopWidth: 1, borderTopColor: C.line,
  },
  start: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  startText: { color: '#1a0b03', fontSize: 16, fontWeight: '800' },
});
