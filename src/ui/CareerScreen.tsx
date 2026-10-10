import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TRIPS, WEEK_PAY, nextTrip, tripCost, tripOpen, type Career, type TripDef } from '../game/career';
import { PARTNERS, PARTNER_IDS } from '../game/partners';
import { isUnlocked, type Profile } from '../game/profile';
import { ROUTES, ROUTE_IDS } from '../game/routes';
import { SEASONS, SEASON_IDS } from '../game/season';
import type { Plan } from './PlanScreen';
import { C, NUM } from './theme';

/** The career hub: money, training, the trip ladder, and the next trip's plan. */
export function CareerScreen({
  career,
  profile,
  plan,
  setPlan,
  onWork,
  onGo,
  onBack,
}: {
  career: Career;
  profile: Profile;
  plan: Plan;
  setPlan: (p: Plan) => void;
  onWork: () => void;
  /** Start the next trip (snow school or a climb) with the plan. */
  onGo: (trip: TripDef) => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const next = nextTrip(career);
  const ownedCount = Object.keys(career.owned).length;
  const short = next ? tripCost(next) > career.money : false;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 130 + insets.bottom }}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>{'‹'} Back</Text>
        </Pressable>
        <Text style={styles.h1}>Career</Text>
        <Text style={styles.body}>
          From a forest hike to Rainier. Buy or rent gear, pay for permits and gas, and work when money runs out. Prices and fees are rough real-world figures.
        </Text>

        <View style={styles.stats}>
          <Stat label="MONEY" value={`$${career.money}`} bad={career.money < 0} />
          <Stat label="WEEKS WORKED" value={String(career.weeks)} />
          <Stat label="FITNESS" value={`${career.fitness}/3`} />
          <Stat label="GEAR" value={String(ownedCount)} />
        </View>
        <Pressable style={styles.secondary} onPress={onWork} accessibilityRole="button">
          <Text style={styles.secondaryText}>Work a week (+${WEEK_PAY})</Text>
        </Pressable>

        <Text style={styles.section}>THE ROAD TO RAINIER</Text>
        {TRIPS.map((t) => {
          const done = career.done.includes(t.id);
          const open = tripOpen(career, t);
          const isNext = next?.id === t.id;
          return (
            <View key={t.id} style={[styles.card, isNext && styles.cardOn, !open && { opacity: 0.45 }]}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{done ? '✓ ' : ''}{t.name}</Text>
                <Text style={[styles.cost, NUM]}>${tripCost(t)}</Text>
              </View>
              <Text style={styles.body}>{t.what}</Text>
              <Text style={styles.small}>{t.teaches}</Text>
              {t.season ? <Text style={styles.small}>{SEASONS[t.season].label} · {t.feeNote}</Text> : <Text style={styles.small}>{t.feeNote}</Text>}
            </View>
          );
        })}

        {next && next.id !== 'school' ? (
          <>
            {next.id === 'rainier' ? (
              <>
                <Text style={styles.section}>ROUTE</Text>
                <View style={styles.chips}>
                  {ROUTE_IDS.filter((id) => isUnlocked(profile, id)).map((id) => (
                    <Chip key={id} label={ROUTES[id].name} on={plan.route === id} onPress={() => setPlan({ ...plan, route: id })} />
                  ))}
                </View>
                <Text style={styles.section}>SEASON</Text>
                <View style={styles.chips}>
                  {SEASON_IDS.map((id) => (
                    <Chip key={id} label={SEASONS[id].label} on={plan.season === id} onPress={() => setPlan({ ...plan, season: id })} />
                  ))}
                </View>
              </>
            ) : null}
            <Text style={styles.section}>ROPE PARTNER</Text>
            <View style={styles.chips}>
              {PARTNER_IDS.map((id) => (
                <Chip key={id} label={PARTNERS[id].name} on={plan.partner === id} onPress={() => setPlan({ ...plan, partner: id })} />
              ))}
            </View>
            <Text style={styles.small}>{PARTNERS[plan.partner].title}. {PARTNERS[plan.partner].blurb}</Text>
          </>
        ) : null}
        {!next ? <Text style={styles.body}>You’ve climbed Rainier. Keep climbing from the Plan screen, or start a new career.</Text> : null}
      </ScrollView>

      {next ? (
        <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
          {short ? <Text style={styles.warn}>You need ${tripCost(next)} for the trip. Work a week first.</Text> : null}
          <Pressable
            style={[styles.start, short && { opacity: 0.4 }]}
            disabled={short}
            onPress={() => onGo(next)}
            accessibilityRole="button"
          >
            <Text style={styles.startText}>{next.id === 'school' ? 'Go to snow school' : `Get ready for ${next.name}`}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
      <Text style={[styles.chipText, on && { color: '#1a0b03' }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, NUM, bad && { color: C.bad }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  back: { color: C.ice, fontSize: 15, paddingVertical: 6 },
  h1: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  body: { color: C.muted, fontSize: 13, lineHeight: 18 },
  small: { color: C.faint, fontSize: 12, lineHeight: 17 },
  warn: { color: C.warn, fontSize: 13, fontWeight: '600' },
  section: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginTop: 8 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: C.panel, borderRadius: 10, padding: 10 },
  statLabel: { color: C.faint, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  statValue: { color: C.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
  card: { backgroundColor: C.panel, borderRadius: 14, padding: 14, gap: 5, borderWidth: 1, borderColor: C.line },
  cardOn: { borderColor: C.accent },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
  cost: { color: C.ice, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontSize: 13, fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: C.ice, fontSize: 15, fontWeight: '700' },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 10, backgroundColor: C.panel,
    borderTopWidth: 1, borderTopColor: C.line, gap: 8,
  },
  start: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  startText: { color: '#1a0b03', fontSize: 16, fontWeight: '800' },
});
