import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORIES, GEAR, GEAR_BY_ID, packWeightLb, recommendedFor, toggleGear, type Gear } from '../game/gear';
import { PARTNERS } from '../game/partners';
import { ROUTES } from '../game/routes';
import { SEASONS } from '../game/season';
import type { Plan } from './PlanScreen';
import { C, NUM } from './theme';

function fmtWeight(oz: number) {
  return oz >= 16 ? `${(oz / 16).toFixed(1)} lb` : `${oz} oz`;
}

export function PackScreen({
  packed,
  setPacked,
  plan,
  onStart,
  onBack,
}: {
  packed: string[];
  setPacked: (ids: string[]) => void;
  plan: Plan;
  onStart: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const season = plan.season;
  const route = ROUTES[plan.route];
  const partner = PARTNERS[plan.mode === 'guided' ? 'guide' : plan.partner];
  const sections = useMemo(
    () => CATEGORIES.map((cat) => ({ title: cat, data: GEAR.filter((g) => g.cat === cat) })),
    [],
  );
  const total = packWeightLb(packed);
  const summitDay = packWeightLb(packed, true);
  const heavy = total > 48;
  const noBoots = !packed.some((id) => GEAR_BY_ID[id]?.group === 'boots');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>{'‹'} Back</Text>
        </Pressable>
        <Text style={styles.h1}>Pack your gear</Text>
        <Text style={styles.planLine}>
          {plan.daily ? 'DAILY CLIMB · ' : ''}{route.name.toUpperCase()} · {SEASONS[season].label.toUpperCase()} · WITH {partner.name.toUpperCase()}
        </Text>
        <Text style={styles.sub}>
          {route.bivouacs.length ? 'Three days' : 'Two days'}: {route.nodes[0].name} to {route.nodes[route.camp].name}, a few hours of sleep, then an alpine start for the summit.
          {plan.mode === 'guided' ? ' Your guide will rent you any climbing gear you forget.' : ''}
        </Text>
        <View style={styles.weights}>
          <View style={styles.weightBox}>
            <Text style={styles.weightLabel}>TO CAMP MUIR</Text>
            <Text style={[styles.weightNum, NUM, heavy && { color: C.warn }]}>{total.toFixed(1)} lb</Text>
          </View>
          <View style={styles.weightBox}>
            <Text style={styles.weightLabel}>SUMMIT DAY</Text>
            <Text style={[styles.weightNum, NUM]}>{summitDay.toFixed(1)} lb</Text>
          </View>
          <View style={styles.weightBox}>
            <Text style={styles.weightLabel}>ITEMS</Text>
            <Text style={[styles.weightNum, NUM]}>{packed.length}</Text>
          </View>
        </View>
        <View style={styles.quick}>
          <Pressable style={styles.quickBtn} onPress={() => setPacked(recommendedFor(season, plan.route))} accessibilityRole="button">
            <Text style={styles.quickText}>Use a guide's {SEASONS[season].label} list</Text>
          </Pressable>
          <Pressable style={styles.quickBtn} onPress={() => setPacked([])} accessibilityRole="button">
            <Text style={styles.quickText}>Empty the pack</Text>
          </Pressable>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(g) => g.id}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title.toUpperCase()}</Text>}
        renderItem={({ item }) => (
          <GearRow
            gear={item}
            on={packed.includes(item.id)}
            seasonal={SEASONS[season].extraGear.includes(item.id) ? SEASONS[season].label : route.extraGear.includes(item.id) ? `the ${route.name}` : undefined}
            onPress={() => setPacked(toggleGear(packed, item.id))}
          />
        )}
      />

      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        {noBoots ? (
          <Text style={styles.footNote}>Pick a pair of boots to start.</Text>
        ) : heavy ? (
          <Text style={styles.footNote}>Heavy pack. Every pound costs stamina on the way up.</Text>
        ) : (
          <Text style={styles.footNote}>Camp gear stays at high camp on summit day.</Text>
        )}
        <Pressable
          style={[styles.start, noBoots && { opacity: 0.4 }]}
          disabled={noBoots}
          onPress={onStart}
          accessibilityRole="button"
        >
          <Text style={styles.startText}>Drive to {route.nodes[0].name}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function GearRow({ gear, on, seasonal, onPress }: { gear: Gear; on: boolean; seasonal?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.raised }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
    >
      <View style={[styles.check, gear.group && styles.radio, on && styles.checkOn]}>
        {on && <View style={[styles.checkDot, gear.group && { borderRadius: 5 }]} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowTop}>
          <Text style={[styles.name, !on && { color: C.muted }]} numberOfLines={2}>{gear.name}</Text>
          <Text style={[styles.oz, NUM]}>{fmtWeight(gear.oz)}</Text>
        </View>
        {seasonal ? <Text style={styles.tag}>Guides add this for {seasonal}</Text> : null}
        <Text style={styles.note}>{gear.note}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.line, gap: 10 },
  back: { color: C.ice, fontSize: 15, paddingVertical: 6 },
  h1: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: C.muted, fontSize: 14, lineHeight: 20 },
  weights: { flexDirection: 'row', gap: 8 },
  weightBox: { flex: 1, backgroundColor: C.panel, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  weightLabel: { color: C.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  weightNum: { color: C.text, fontSize: 20, fontWeight: '700', marginTop: 2 },
  quick: { flexDirection: 'row', gap: 8 },
  planLine: { color: C.ice, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  tag: { color: C.warn, fontSize: 11, fontWeight: '700', marginTop: 3 },
  quickBtn: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  quickText: { color: C.ice, fontSize: 13, fontWeight: '600' },
  section: {
    color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6, backgroundColor: C.bg,
  },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingVertical: 11, alignItems: 'flex-start' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.faint, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  radio: { borderRadius: 11 },
  checkOn: { borderColor: C.accent },
  checkDot: { width: 10, height: 10, borderRadius: 2, backgroundColor: C.accent },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  name: { color: C.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  oz: { color: C.muted, fontSize: 13 },
  note: { color: C.faint, fontSize: 13, lineHeight: 18, marginTop: 3 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 10, backgroundColor: C.panel,
    borderTopWidth: 1, borderTopColor: C.line, gap: 8,
  },
  footNote: { color: C.muted, fontSize: 12 },
  start: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  startText: { color: '#1a0b03', fontSize: 16, fontWeight: '800' },
});
