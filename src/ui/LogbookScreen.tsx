import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ENDINGS } from '../game/endings';
import { PARTNERS } from '../game/partners';
import { BADGES, MAX_LEVEL, SKILL_NAMES, levelOf, levelProgress, type Profile } from '../game/profile';
import { formatFt } from '../game/route';
import { ROUTES } from '../game/routes';
import { SEASONS } from '../game/season';
import type { EndingId, SkillLevels } from '../game/types';
import { C, NUM } from './theme';

export function LogbookScreen({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const summits = profile.log.filter((e) => e.summited && ENDINGS[e.ending as EndingId]?.good).length;
  const home = profile.log.filter((e) => ENDINGS[e.ending as EndingId]?.good).length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 + insets.bottom }}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>{'‹'} Back</Text>
        </Pressable>
        <Text style={styles.h1}>Logbook</Text>

        <View style={styles.stats}>
          <Stat label="CLIMBS" value={String(profile.log.length)} />
          <Stat label="SUMMITS" value={String(summits)} />
          <Stat label="HOME SAFE" value={String(home)} />
          <Stat label="HARDCORE" value={`${profile.hardcore.streak}`} sub={`best ${profile.hardcore.best}`} />
        </View>

        <Text style={styles.section}>SKILLS</Text>
        {(Object.keys(SKILL_NAMES) as (keyof SkillLevels)[]).map((k) => {
          const xp = profile.xp[k];
          const lvl = levelOf(xp);
          return (
            <View key={k} style={styles.skill}>
              <View style={styles.skillTop}>
                <Text style={styles.skillName}>{SKILL_NAMES[k].name}</Text>
                <Text style={[styles.skillLvl, NUM]}>Level {lvl}{lvl >= MAX_LEVEL ? ' (max)' : ''}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(levelProgress(xp) * 100)}%` }]} />
              </View>
              <Text style={styles.small}>{SKILL_NAMES[k].what}</Text>
            </View>
          );
        })}

        <Text style={styles.section}>BADGES · {profile.badges.length} OF {BADGES.length}</Text>
        <View style={styles.badges}>
          {BADGES.map((b) => {
            const got = profile.badges.includes(b.id);
            return (
              <View key={b.id} style={[styles.badge, !got && { opacity: 0.4 }]} accessibilityLabel={`${b.name}. ${got ? 'Earned' : 'Not yet'}. ${b.how}`}>
                <Text style={[styles.badgeName, got && { color: C.warn }]}>{got ? '★ ' : ''}{b.name}</Text>
                <Text style={styles.small}>{b.how}</Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.section}>CLIMBS</Text>
        {profile.log.length === 0 ? <Text style={styles.small}>No climbs yet.</Text> : null}
        {profile.log.map((e) => {
          const end = ENDINGS[e.ending as EndingId];
          return (
            <View key={e.id} style={styles.entry}>
              {e.photo ? <Image source={{ uri: e.photo }} style={styles.photo} accessibilityLabel="Summit photo" /> : null}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.entryTitle, { color: end?.good ? C.good : C.bad }]}>{end?.title ?? e.ending}</Text>
                <Text style={styles.small}>
                  {new Date(e.date).toLocaleDateString()} · {ROUTES[e.route].name} · {SEASONS[e.season].label} · {PARTNERS[e.partner].name}
                  {e.mode !== 'standard' ? ` · ${e.mode}` : ''}{e.daily ? ' · daily' : ''}
                </Text>
                <Text style={[styles.small, NUM]}>
                  High point {formatFt(e.highFt)} · {e.hours} h · score {e.score} · seed {e.seed}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, NUM]}>{value}</Text>
      {sub ? <Text style={styles.small}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  back: { color: C.ice, fontSize: 15, paddingVertical: 6 },
  h1: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  section: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginTop: 8 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: C.panel, borderRadius: 10, padding: 10 },
  statLabel: { color: C.faint, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  statValue: { color: C.text, fontSize: 20, fontWeight: '800', marginTop: 2 },
  skill: { backgroundColor: C.panel, borderRadius: 12, padding: 12, gap: 6 },
  skillTop: { flexDirection: 'row', justifyContent: 'space-between' },
  skillName: { color: C.text, fontSize: 15, fontWeight: '700' },
  skillLvl: { color: C.ice, fontSize: 13, fontWeight: '700' },
  track: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: C.ice },
  small: { color: C.muted, fontSize: 12, lineHeight: 17 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { width: '48%', flexGrow: 1, backgroundColor: C.panel, borderRadius: 10, padding: 10, gap: 3 },
  badgeName: { color: C.text, fontSize: 13, fontWeight: '800' },
  entry: { flexDirection: 'row', gap: 12, backgroundColor: C.panel, borderRadius: 12, padding: 10, alignItems: 'center' },
  entryTitle: { fontSize: 15, fontWeight: '800' },
  photo: { width: 72, height: 96, borderRadius: 8, backgroundColor: C.raised },
});
