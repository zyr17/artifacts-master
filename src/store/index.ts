import { InjectionKey } from 'vue'
import { createStore, useStore as baseUseStore, Store } from 'vuex'
import { ArtifactScoreWeight, Artifact } from '../ys/artifact'
import { IState } from './types'
import chs from '../ys/locale/chs'
import data from '../ys/data'
import build from '../ys/build'

function countArtifactAttr(artifacts: Artifact[], key: keyof Artifact) {
    let s: { [key: string]: number } = {}
    for (let a of artifacts) {
        let akey = a[key].toString()
        s[akey] = (akey in s) ? s[akey] + 1 : 1
    }
    return s
}
const LOADING_DELAY = 250
export const key: InjectionKey<Store<IState>> = Symbol()
export const store = createStore<IState>({
    state: () => {
        let set: string[] = [], slot: string[] = [], main: string[] = [], location = ['']
        for (let key in chs.set) set.push(key)
        for (let key in chs.slot) slot.push(key)
        for (let key of data.mainKeys.all) main.push(key)
        for (let key in chs.character) location.push(key)
        return {
            set,
            slot,
            mainKey: main,
            location,
            artifacts: [],
            filteredArtifacts: [],
            filter: {
                set: '',
                slot: '',
                main: '', // mainKey should be better
                location: 'all', // 'all' is a temporary workaround, fix it later
                lock: '', // '', 'true', 'false'
                lvRange: [0, 20],
                score: [0, 20]
            },
            build: {
                set: {
                    2: [],
                    4: []
                },
                main: {
                    flower: ['hp'],
                    plume: ['atk'],
                    sands: [],
                    goblet: [],
                    circlet: []
                },
            },
            filterBatch: [],
            useFilterPro: false,
            useFilterBatch: -1,  // -1 notwork, 0~length-1 select one
            weight: new ArtifactScoreWeight(),
            useWeightJson: false,
            usePreset: '',
            sortBy: 'tot',
            canExport: false,
            nReload: 0,// for UI refreshing
            loading: false,
        }
    },
    getters: {
        equiped(state): { string?: { string?: { string? : Artifact[][] }}} {
            /* Save equiped artifacts based on their set and slot.
             * For equiped.x.y.z[i][j], x is set name, y is slot name, z is 
             * mainKey name, i in [0-3] means four match rule i + 1, j is index
             * of a matched artifact. When an artifact has set x, slot y, 
             * mainKey z, and will compare equiped artifacts with rule i, the 
             * artifacts list it should compare all lies in equiped.x.y.z[i].
             * 
             * four rules are:
             * 1. set and slot and mainKey exactly match. will always used in 
             *    comparison.
             * 2. slot and mainKey match, and set appears on other slots of 
             *    one character. it can be used to complete current set, so 
             *    we can replace artifacts in this set with other non-set 
             *    artifacts. e.g., Kokomi has OceanHuedClam in all solt except
             *    heal circlet, and all OceanHuedClam heal circlet will fit
             *    this rule.
             * 3. only slot and mainKey match, and set is not used, i.e. the
             *    non-set artifact equiped by characters. Specially, if a
             *    character equiped three or five same set artifacts, all of 
             *    them will be considered as non-set artifacts.
             * 4. slot and mainKey match, no restrictions on set, so 
             *    equiped.x.y.z[i] will be all same for any x.
             * 
             * With above definition, for equiped.x.y.z, all artifacts appeared
             * in 1 2 or 3 will also appear in 4. Artifacts appeared in 1, 2, 3
             * will not appear in each other, except artifacts that has 3 or 5
             * same set artifacts equiped by a character, and they will appear
             * both in 1 and 3.
             * 
             */

            let res: { string?: { string?: { string?: Artifact[][] }}} = {}
            for (let setname of state.set) {
                res[setname] = {}
                for (let slotname of state.slot) {
                    res[setname][slotname] = {}
                    for (let mainkeyname of state.mainKey) {
                        res[setname][slotname][mainkeyname] = [[], [], [], []]
                    }
                }
            }
            let location_counter = {}
            for (let artifact of state.artifacts) {
                if (artifact.location) {
                    // equipped by someone
                    location_counter[artifact.location] = {}
                }
            }
            for (let artifact of state.artifacts)
                if (artifact.location)
                    location_counter[artifact.location][artifact.set] = 0
            for (let artifact of state.artifacts)
                if (artifact.location)
                    location_counter[artifact.location][artifact.set] ++
            let location_set = {}
            let location_overflow_set = {}
            for (let artifact of state.artifacts)
                if (artifact.location) {
                    location_set[artifact.location] = new Set()
                    location_overflow_set[artifact.location] = new Set()
                }
            for (let artifact of state.artifacts)
                if (artifact.location) {
                    let setnum = location_counter[artifact.location][artifact.set]
                    if (setnum >= 2)
                        // if more than 2 equipped, it is as set
                        location_set[artifact.location].add(artifact.set)
                    if (setnum == 3 || setnum == 5)
                        // if 3 or 5 equipped, as overflow, which exists both 
                        // in rule 1 and 3.
                        location_overflow_set[artifact.location].add(artifact.set)
                }
            for (let artifact of state.artifacts)
                if (artifact.location) {
                    let location = artifact.location
                    let set = artifact.set
                    let slot = artifact.slot
                    let mainkey = artifact.mainKey
                    // rule 1
                    if (location_set[location].has(set))
                        res[set][slot][mainkey][0].push(artifact)
                    // rule 2
                    for (let otherset of location_set[location])
                        if (otherset != set)
                            res[otherset][slot][mainkey][1].push(artifact)
                    // rule 3
                    if (!location_set[location].has(set) || 
                            location_overflow_set[location].has(set))
                        for (let otherset of state.set)
                            res[otherset][slot][mainkey][2].push(artifact)
                    // rule 4
                    for (let otherset of state.set)
                        res[otherset][slot][mainkey][3].push(artifact)
                }
            return res
        },
        filterSets(state) {
            let ret = [{ key: "", value: "全部", tip: state.artifacts.length.toString() }],
                s = countArtifactAttr(state.artifacts, 'set')
            for (let key in chs.set) {
                if (key in s)
                    ret.push({ key, value: chs.set[key].name, tip: s[key].toString() });
            }
            return ret;
        },
        filterSlots(state) {
            let ret = [{ key: "", value: "全部", tip: state.artifacts.length.toString() }],
                s = countArtifactAttr(state.artifacts, 'slot')
            for (let key in chs.slot) {
                if (key in s)
                    ret.push({ key, value: chs.slot[key], tip: s[key].toString() });
            }
            return ret;
        },
        filterMains(state) {
            let ret = [{ key: "", value: "全部", tip: state.artifacts.length.toString() }],
                s = countArtifactAttr(state.artifacts, 'mainKey')
            for (let key of data.mainKeys.all) {
                if (key in s)
                    ret.push({ key, value: chs.affix[key], tip: s[key].toString() });
            }
            return ret;
        },
        filterLocations(state) {
            let ret = [{ key: "all", value: "全部", tip: state.artifacts.length.toString() }],
                s = countArtifactAttr(state.artifacts, 'location')
            if ('' in s) ret.push({ key: '', value: "闲置", tip: s[''].toString() })
            for (let key in chs.character) {
                if (key in s)
                    ret.push({ key, value: chs.character[key], tip: s[key].toString() })
            }
            return ret
        },
        filterLocks(state) {
            let ret = [{ key: "", value: "全部", tip: state.artifacts.length.toString() }],
                s = countArtifactAttr(state.artifacts, 'lock')
            if ('true' in s) ret.push({ key: 'true', value: '加锁', tip: s['true'].toString() })
            if ('false' in s) ret.push({ key: 'false', value: '解锁', tip: s['false'].toString() })
            return ret
        },
    },
    mutations: {
        useWeightJson(state, payload) {
            state.useWeightJson = payload.use
        },
        setWeight(state, payload) {
            state.weight[payload.key] = payload.value
        },
        useFilterPro(state, payload) {
            state.useFilterPro = payload.use
        },
        setFilter(state, payload) {
            (state.filter as any)[payload.key] = payload.value
        },
        setSortBy(state, payload) {
            state.sortBy = payload.sort
        },
        flipLock(state, payload) {
            for (let a of state.artifacts) {
                if (a.data.index == payload.index) {
                    a.lock = !a.lock
                }
            }
        },
        setLock(state, payload) {
            let s: Set<number> = new Set(payload.indices)
            for (let a of state.artifacts) {
                if (s.has(a.data.index)) {
                    a.lock = payload.lock
                }
            }
        },
        usePreset(state, payload) {
            state.weight = payload.weight
            state.usePreset = payload.charKey
            if (payload.charKey in build) {
                let b = build[payload.charKey]
                // 不要直接赋值
                state.build.set[2] = [...b.set[2]]
                state.build.set[4] = [...b.set[4]]
                state.build.main.sands = [...b.main.sands]
                state.build.main.goblet = [...b.main.goblet]
                state.build.main.circlet = [...b.main.circlet]
            }
        },
        setBuildSet2(state, payload) {
            state.build.set[2] = [...payload.set[2]]
        },
        setBuildSet4(state, payload) {
            state.build.set[4] = [...payload.set[4]]
        },
        setBuildMain(state, payload) {
            state.build.main[payload.slot] = [...payload.keys]
        },
        filterBatchIndex(state, payload) {
            state.useFilterBatch = payload
            store.dispatch('updFilteredArtifacts')
        }
    },
    actions: {
        reload({ state }) {
            // 仅弹出加载界面
            state.loading = true
            setTimeout(() => {
                state.loading = false
                state.nReload++
            }, LOADING_DELAY)
        },
        setArtifacts({ state, dispatch }, payload) {
            state.canExport = payload.format === 'GOOD'
            state.artifacts = payload.artifacts
            dispatch('updFilteredArtifacts')
        },
        setLockByFilterBatch({ state }) {
            // TODO two different lock, which is right?
            let newLock = [];
            for (let i = 0; i < state.artifacts.length; i++)
                newLock.push(state.artifacts[i].lock);
            if (state.filterBatch.length === 0) {
                ElNotification({
                    type: 'error',
                    title: '一条规则都没有！',
                })
                return;
            }
            for (let i = 0; i < state.filterBatch.length; i++) {
                let filter = state.filterBatch[i].filter;
                // let ruleResult = [];
                if (state.filterBatch[i].lock == 'disabled')
                    continue
                // use specified filterbatch, filter part set etc. first, to speedup and keep set specified score
                const firstFilterRes = filter.filterIgnoreScore(state.artifacts)
                let firstRet = []
                for (const j of firstFilterRes)
                    firstRet.push(state.artifacts[j])
                // ret = ret.filter(a => filter.filterOne(a));
                for (let a of firstRet) {
                    a.updateAffnum(filter.scoreWeight)
                }
                const filterRes = filter.filter(firstRet)
                for (const j of filterRes)
                    newLock[firstFilterRes[j]] = state.filterBatch[i].lock == 'lock';
                // for (let j = 0; j < state.artifacts.length; j ++ )
                //     if (filter.filterOne(state.artifacts[j])) {
                //         // ruleResult.push(JSON.parse(JSON.stringify(state.artifacts[j])));
                //         newLock[j] = state.filterBatch[i].lock == 'lock';
                //     }
                // console.log(state.filterBatch[i], ruleResult);
            }
            for (let i = 0; i < state.artifacts.length; i++)
                state.artifacts[i].lock = newLock[i];
            state.loading = true
            setTimeout(() => {
                let ret = state.filteredArtifacts.slice()
                console.log(state.sortBy)
                if (state.sortBy == 'prop') { // sort in descending order of charscore
                    ret.sort((a, b) => b.data.charScores[0].score - a.data.charScores[0].score)
                } else if (state.sortBy) { // sort in descending order of affix number
                    ret.sort((a, b) => (b.data.affnum as any)[state.sortBy] - (a.data.affnum as any)[state.sortBy]);
                } else { // sort in ascending order of index
                    ret.sort((a, b) => a.data.index - b.data.index)
                }
                state.filteredArtifacts = ret

                ElNotification({
                    type: 'success',
                    title: '批量规则应用成功',
                })
                state.nReload++
                state.loading = false
            }, LOADING_DELAY)
        },
        updFilteredArtifacts({ state }) {
            state.loading = true
            setTimeout(() => {
                let ret = state.artifacts
                // weight
                let weight = state.weight
                if (state.useFilterPro && state.useFilterBatch != -1) {
                    weight = state.filterBatch[state.useFilterBatch].filter.scoreWeight;
                }
                // update affix numbers
                for (let a of ret) {
                    a.updateAffnum(weight)
                    if(state.usePreset){
                        a.updatePresetTot(state.build)
                        a.updatePresetProp(state.build,state.usePreset,weight)
                    }
                    else if (state.sortBy == 'prop') {
                        a.updateProp()
                    }
                }
                if (state.useFilterPro && state.useFilterBatch != -1) {
                    // use specified filterbatch
                    let filter = state.filterBatch[state.useFilterBatch].filter;
                    const filterRes = filter.filter(state.artifacts)
                    ret = []
                    for (const j of filterRes)
                        ret.push(state.artifacts[j])
                    ret = ret.filter(a => filter.filterOne(a));
                }
                else { // basic filter
                    if (state.filter.set)
                        ret = ret.filter(a => a.set == state.filter.set);
                    if (state.filter.slot)
                        ret = ret.filter(a => a.slot == state.filter.slot);
                    if (state.filter.main)
                        ret = ret.filter(a => a.mainKey == state.filter.main);
                    if (state.filter.location != 'all')
                        ret = ret.filter(a => a.location == state.filter.location)
                    if (state.filter.lock)
                        ret = ret.filter(a => a.lock.toString() == state.filter.lock)
                    ret = ret.filter(a => (
                        state.filter.lvRange[0] <= a.level &&
                        a.level <= state.filter.lvRange[1]
                    ));
                    if (state.sortBy) {
                        if (state.sortBy == 'prop') {
                            ret = ret.filter((a) => (
                                state.filter.score[0] <= a.data.charScores[0].score &&
                                a.data.charScores[0].score <= state.filter.score[1]
                            ));
                        } else {
                            ret = ret.filter((a) => (
                                state.filter.score[0] <= a.data.affnum[state.sortBy] &&
                                a.data.affnum[state.sortBy] <= state.filter.score[1]
                            ));
                        }
                    }
                }
                // sort
                if (state.sortBy == 'prop') { // sort in descending order of charscore
                    ret.sort((a, b) => b.data.charScores[0].score - a.data.charScores[0].score)
                } else if (state.sortBy) { // sort in descending order of affix number
                    ret.sort((a, b) => (b.data.affnum as any)[state.sortBy] - (a.data.affnum as any)[state.sortBy]);
                } else { // sort in ascending order of index
                    ret.sort((a, b) => a.data.index - b.data.index)
                }
                // update
                state.filteredArtifacts = ret;
                state.nReload++
                state.loading = false
            }, LOADING_DELAY)
        },
        updArtifact({ state, dispatch }, payload) {
            for (let a of state.filteredArtifacts) {
                if (a.data.index == payload.index) {
                    if (payload.toSwap) {
                        for (let b of state.artifacts) {
                            if (b.location == payload.newArt.location && b.slot == payload.newArt.slot) {
                                b.location = a.location
                                break
                            }
                        }
                    }
                    a.location = payload.newArt.location
                    a.level = payload.newArt.level
                    a.minors = payload.newArt.minors
                    break
                }
            }
            dispatch('updFilteredArtifacts')
        },
        delArtifacts({ state, dispatch }, payload) {
            let s: Set<number> = new Set(payload.indices)
            let i = 0
            for (let a of state.artifacts) {
                if (s.has(a.data.index)) {
                    state.artifacts.splice(i, 1)
                }
                i++
            }
            dispatch('updFilteredArtifacts') // 也许可以改为部分更新
        },
        addArtifacts({ state, dispatch }, payload) {
            // Array.concat貌似不好用，只能一个个push
            for (let a of payload.artifacts)
                state.artifacts.push(a)
            dispatch('updFilteredArtifacts') // 也许可以改为部分更新
        },
    }
})

export function useStore() {
    return baseUseStore(key)
}