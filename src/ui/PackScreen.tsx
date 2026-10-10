import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORIES, GEAR, GEAR_BY_ID, packWeightLb, recommendedFor, toggleGear, type Gear } from '../game/gear';
import { PARTNERS } from '../game/partners';
import { ROUTES } from '../game/routes';
import { SEASONS } from '../game/season';
import { CONSUMABLES, PRICES, rentalCost, tripCost, usable, type Career, type TripDef } from '../game/career';
import type { Plan } from './PlanScreen';

/** Career packing: what you own, what you rent for this trip, and the shop. */
export interface CareerPack {
  career: Career;
  trip: TripDef;
  rented: string[];
  setRented: (ids: string[]) => void;
  onBuy: (id: string) => void;
}
import { C, NUM } from './theme';

function fmtWeight(oz: number) {
  return oz >= 16 ? `${(oz / 16).toFixed(1)} lb` : `${oz} oz`;
}

export function PackScreen({
  packed,
  setPacked,
  plan,
  career,
  onStart,
  onBack,
}: {
  packed: string[];
  setPacked: (ids: string[]) => void;
  plan: Plan;
  career?: CareerPack;
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
  // Career: only what you own or rent can go in the pack.
  const avail = career ? new Set(usable(career.career, career.rented)) : null;
  const tripMoney = career ? tripCost(career.trip) + rentalCost(career.rented) : 0;
  const broke = career ? tripMoney > career.career.money : false;
  const guideList = recommendedFor(season, plan.route);
  const missing = avail ? guideList.filter((id) => !avail.has(id)) : [];
  const toggle = (id: string) => {
    if (avail && !avail.has(id)) return;
    setPacked(toggleGear(packed, id));
  };

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
          {route.dayTrip
            ? `A day trip: ${route.nodes[0].name} to ${route.nodes[route.nodes.length - 1].name} and back.`
            : `${route.bivouacs.length ? 'Three days' : 'Two days'}: ${route.nodes[0].name} to ${route.nodes[route.camp].name}, a few hours of sleep, then an alpine start for the summit.`}
          {plan.mode === 'guided' ? ' Your guide will rent you any climbing gear you forget.' : ''}
        </Text>
        {career ? (
          <Text style={[styles.money, NUM, broke && { color: C.bad }]}>
            ${career.career.money} · trip ${tripCost(career.trip)}{career.rented.length ? ` + rentals $${rentalCost(career.rented)}` : ''}
            {missing.length ? `  ·  ${missing.length} on the guide's list you don't have` : ''}
          </Text>
        ) : null}
        <View style={styles.weights}>
          <View style={styles.weightBox}>
            <Text style={styles.weightLabel}>{route.dayTrip ? 'PACK' : 'TO HIGH CAMP'}</Text>
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
          <Pressable
            style={styles.quickBtn}
            onPress={() => setPacked(avail ? guideList.filter((id) => avail.has(id)) : guideList)}
            accessibilityRole="button"
          >
            <Text style={styles.quickText}>{route.list ? "Use a guide's list" : `Use a guide's ${SEASONS[season].label} list`}</Text>
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
            onPress={() => toggle(item.id)}
            shop={career && !CONSUMABLES.includes(item.id) ? {
              wear: career.career.owned[item.id],
              rented: career.rented.includes(item.id),
              price: PRICES[item.id],
              money: career.career.money,
              onBuy: () => career.onBuy(item.id),
              onRent: () => {
                const on = career.rented.includes(item.id);
                career.setRented(on ? career.rented.filter((x) => x !== item.id) : [...career.rented, item.id]);
                if (on) setPacked(packed.filter((x) => x !== item.id));
                else setPacked(toggleGear(packed, item.id));
              },
            } : undefined}
          />
        )}
      />

      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        {broke ? (
          <Text style={[styles.footNote, { color: C.bad }]}>Not enough money for this trip. Rent less, or go back and work a week.</Text>
        ) : noBoots ? (
          <Text style={styles.footNote}>Pick a pair of boots to start.</Text>
        ) : heavy ? (
          <Text style={styles.footNote}>Heavy pack. Every pound costs stamina on the way up.</Text>
        ) : (
          <Text style={styles.footNote}>{route.dayTrip ? 'A day trip: no camp gear needed.' : 'Camp gear stays at high camp on summit day.'}</Text>
        )}
        <Pressable
          style={[styles.start, (noBoots || broke) && { opacity: 0.4 }]}
          disabled={noBoots || broke}
          onPress={onStart}
          accessibilityRole="button"
        >
          <Text style={styles.startText}>Drive to {route.nodes[0].name}</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface Shop {
  /** Wear 0..100 if you own it. */
  wear: number | undefined;
  rented: boolean;
  price: { buy: number; rent: number | null } | undefined;
  money: number;
  onBuy: () => void;
  onRent: () => void;
}

function GearRow({ gear, on, seasonal, onPress, shop }: { gear: Gear; on: boolean; seasonal?: string; onPress: () => void; shop?: Shop }) {
  const owned = shop?.wear !== undefined;
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
        {shop ? (
          owned ? (
            <Text style={[styles.owned, NUM, (shop.wear ?? 0) >= 60 && { color: C.warn }]}>
              Yours · {shop.wear === 0 ? 'new' : `${shop.wear}% worn`}
            </Text>
          ) : (
            <View style={styles.shopRow}>
              {shop.price ? (
                <Pressable
                  onPress={shop.onBuy}
                  disabled={shop.money < shop.price.buy}
                  style={[styles.shopBtn, shop.money < shop.price.buy && { opacity: 0.35 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Buy ${gear.name} for ${shop.price.buy} dollars`}
                >
                  <Text style={[styles.shopText, NUM]}>Buy ${shop.price.buy}</Text>
                </Pressable>
              ) : null}
              {shop.price?.rent != null ? (
                <Pressable
                  onPress={shop.onRent}
                  style={[styles.shopBtn, shop.rented && styles.shopOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`${shop.rented ? 'Return' : 'Rent'} ${gear.name}, ${shop.price.rent} dollars for this trip`}
                >
                  <Text style={[styles.shopText, NUM, shop.rented && { color: '#1a0b03' }]}>{shop.rented ? 'Rented' : 'Rent'} ${shop.price.rent}</Text>
                </Pressable>
              ) : null}
            </View>
          )
        ) : null}
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
  money: { color: C.good, fontSize: 13, fontWeight: '700' },
  owned: { color: C.good, fontSize: 12, fontWeight: '700', marginTop: 4 },
  shopRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  shopBtn: { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  shopOn: { backgroundColor: C.accent, borderColor: C.accent },
  shopText: { color: C.ice, fontSize: 12, fontWeight: '700' },
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
