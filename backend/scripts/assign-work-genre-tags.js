const path = require("path");
const Database = require("better-sqlite3");
const { ensureDatabaseSchema } = require("../app/utils/databaseSchema");

const dbPath =
  process.env.DB_PATH || path.join(__dirname, "..", "db", "database.sqlite");
const db = new Database(dbPath);

const genreTagsByWorkId = {
  "christmas_memory": ["genre:short-fiction", "genre:southern-literature"],
  "connecticut_yankee_in_king_arthur's_court": [
    "genre:satire",
    "genre:science-fantasy",
    "genre:american-literature",
  ],
  "ladys_life_in_the_rocky_mountains": [
    "genre:travel-writing",
    "genre:memoir",
    "genre:victorian-literature",
  ],
  "night_to_remember": [
    "genre:journalism",
    "genre:historical-nonfiction",
    "genre:maritime-history",
  ],
  "supposedly_fun_thing_i'll_never_do_again": [
    "genre:essays",
    "genre:journalism",
    "genre:american-literature",
  ],
  "tree_grows_in_brooklyn": [
    "genre:bildungsroman",
    "genre:american-literature",
    "genre:literary-fiction",
  ],
  "vindication_of_the_rights_of_woman": [
    "genre:feminism",
    "genre:philosophy",
    "genre:political-writing",
  ],
  "absalom_absalom": [
    "genre:southern-gothic",
    "genre:modernism",
    "genre:american-literature",
  ],
  "ah_wilderness": ["genre:drama", "genre:american-literature"],
  "all_men_are_brothers": [
    "genre:classic-chinese-fiction",
    "genre:historical-fiction",
  ],
  "all_quiet_on_the_western_front": [
    "genre:war-literature",
    "genre:german-literature",
    "genre:antiwar-fiction",
  ],
  "american_tabloid": [
    "genre:crime-fiction",
    "genre:historical-fiction",
    "genre:noir",
  ],
  "introduction_to_the_american_underground_film": [
    "genre:film-criticism",
    "genre:nonfiction",
  ],
  "outcast_of_the_islands": [
    "genre:adventure-fiction",
    "genre:colonial-fiction",
  ],
  "anglers_moon": ["genre:nature-writing", "genre:essays"],
  "anna_karenina": [
    "genre:russian-literature",
    "genre:realism",
    "genre:classic-literature",
  ],
  "babbitt": [
    "genre:satire",
    "genre:american-literature",
    "genre:social-criticism",
  ],
  "basic_writings_of_martin_heidegger": [
    "genre:philosophy",
    "genre:continental-philosophy",
  ],
  "beauty_and_the_book": ["genre:book-history", "genre:nonfiction"],
  "beloved": [
    "genre:american-literature",
    "genre:historical-fiction",
    "genre:literary-fiction",
  ],
  "beowulf": ["genre:epic-poetry", "genre:classics"],
  "black_lamb_and_grey_falcon": [
    "genre:history",
    "genre:travel-writing",
    "genre:memoir",
  ],
  "bloods_a_rover": [
    "genre:crime-fiction",
    "genre:historical-fiction",
    "genre:noir",
  ],
  "buddenbrooks": [
    "genre:german-literature",
    "genre:family-saga",
    "genre:realism",
  ],
  "built_of_books_how_reading_defined_the_life_of_oscar_wilde": [
    "genre:biography",
    "genre:book-history",
    "genre:literary-criticism",
  ],
  "castle_to_castle": [
    "genre:french-literature",
    "genre:autofiction",
    "genre:war-literature",
  ],
  "cheri_and_the_last_of_cheri": [
    "genre:french-literature",
    "genre:novella",
    "genre:belle-epoque-fiction",
  ],
  "chilly_scenes_of_winter": [
    "genre:american-literature",
    "genre:contemporary-fiction",
  ],
  "cider_with_rosie": [
    "genre:memoir",
    "genre:nature-writing",
    "genre:british-literature",
  ],
  "cinema_yesterday_and_today": ["genre:film-criticism", "genre:nonfiction"],
  "clarissa": [
    "genre:epistolary-fiction",
    "genre:british-literature",
    "genre:classic-literature",
  ],
  "confessions_of_a_mask": [
    "genre:japanese-literature",
    "genre:autobiographical-fiction",
    "genre:literary-fiction",
  ],
  "conversations_with_eckermann": [
    "genre:memoir",
    "genre:literary-conversations",
    "genre:german-literature",
  ],
  "cranford": [
    "genre:british-literature",
    "genre:classic-literature",
    "genre:social-fiction",
  ],
  "dance_dance_dance": [
    "genre:japanese-literature",
    "genre:magical-realism",
    "genre:contemporary-fiction",
  ],
  "darkness_visible": ["genre:memoir", "genre:psychology", "genre:essays"],
  "darkness_at_noon": [
    "genre:political-fiction",
    "genre:historical-fiction",
    "genre:philosophical-fiction",
  ],
  "death_in_venice_and_seven_other_stories": [
    "genre:german-literature",
    "genre:novella",
    "genre:short-stories",
  ],
  "dialogues_on_love_and_friendship": ["genre:philosophy", "genre:essays"],
  "diary_of_a_mad_old_man": [
    "genre:japanese-literature",
    "genre:novella",
    "genre:literary-fiction",
  ],
  "don_quixote": [
    "genre:spanish-literature",
    "genre:picaresque",
    "genre:classic-literature",
  ],
  "dracula": [
    "genre:gothic-fiction",
    "genre:horror",
    "genre:british-literature",
  ],
  "dreams": ["genre:literary-fiction", "genre:short-fiction"],
  "dubliners": [
    "genre:irish-literature",
    "genre:short-stories",
    "genre:modernism",
  ],
  "east_o_the_sun_and_west_o_the_moon": [
    "genre:fairy-tales",
    "genre:folklore",
    "genre:childrens-literature",
  ],
  "echoes_from_the_macabre": ["genre:horror", "genre:short-stories"],
  "emma": [
    "genre:british-literature",
    "genre:classic-literature",
    "genre:comedy-of-manners",
  ],
  "faust": [
    "genre:drama",
    "genre:german-literature",
    "genre:classic-literature",
  ],
  "flight_to_arras": [
    "genre:memoir",
    "genre:war-literature",
    "genre:french-literature",
  ],
  "four_major_plays_federico_garcía_lorca": [
    "genre:drama",
    "genre:spanish-literature",
    "genre:modern-classics",
  ],
  "from_man_to_man": [
    "genre:south-african-literature",
    "genre:literary-fiction",
  ],
  "fun_in_a_chinese_laundry": [
    "genre:memoir",
    "genre:american-literature",
    "genre:film",
  ],
  "gigi": ["genre:french-literature", "genre:novella"],
  "glory": ["genre:russian-literature", "genre:literary-fiction"],
  "go_tell_it_on_the_mountain": [
    "genre:american-literature",
    "genre:autobiographical-fiction",
    "genre:literary-fiction",
  ],
  "goethes_faust": [
    "genre:drama",
    "genre:german-literature",
    "genre:classic-literature",
  ],
  "gullivers_travels": [
    "genre:satire",
    "genre:adventure-fiction",
    "genre:irish-literature",
  ],
  "heart_of_darkness": [
    "genre:novella",
    "genre:colonial-fiction",
    "genre:british-literature",
  ],
  "hitler_and_the_holocaust": [
    "genre:history",
    "genre:journalism",
    "genre:nonfiction",
  ],
  "hofmannsthal_selected_prose": [
    "genre:essays",
    "genre:austrian-literature",
    "genre:literary-prose",
  ],
  "holderlin_selected_verse": ["genre:poetry", "genre:german-literature"],
  "human_action": [
    "genre:economics",
    "genre:philosophy",
    "genre:political-economy",
  ],
  "hunger": [
    "genre:norwegian-literature",
    "genre:modernism",
    "genre:literary-fiction",
  ],
  "i_have_no_mouth_and_i_must_scream": [
    "genre:science-fiction",
    "genre:dystopian-fiction",
    "genre:short-stories",
  ],
  "if_beale_street_could_talk": [
    "genre:american-literature",
    "genre:literary-fiction",
    "genre:romance",
  ],
  "infinite_jest": [
    "genre:american-literature",
    "genre:postmodernism",
    "genre:contemporary-fiction",
  ],
  "invisible_man": [
    "genre:american-literature",
    "genre:literary-fiction",
    "genre:bildungsroman",
  ],
  "island": [
    "genre:philosophical-fiction",
    "genre:utopian-fiction",
    "genre:british-literature",
  ],
  "jacques_the_fatalist_and_his_master": [
    "genre:french-literature",
    "genre:philosophical-fiction",
    "genre:experimental-fiction",
  ],
  "john_sloan_a_painters_life": [
    "genre:biography",
    "genre:art-history",
    "genre:nonfiction",
  ],
  "journey_to_the_abyss": [
    "genre:journalism",
    "genre:history",
    "genre:war-reportage",
  ],
  "junky": [
    "genre:autobiography",
    "genre:beat-literature",
    "genre:american-literature",
  ],
  "keepers_of_the_house": [
    "genre:southern-fiction",
    "genre:american-literature",
  ],
  "kelmscott_doves_and_ashendene": [
    "genre:book-history",
    "genre:design",
    "genre:nonfiction",
  ],
  "king_queen_knave": ["genre:russian-literature", "genre:literary-fiction"],
  "kokoro": [
    "genre:japanese-literature",
    "genre:classic-literature",
    "genre:psychological-fiction",
  ],
  "meditations": ["genre:philosophy", "genre:stoicism", "genre:classics"],
  "metamorphoses": ["genre:classics", "genre:mythology", "genre:epic-poetry"],
  "mont_saint_michel_and_chartres": [
    "genre:history",
    "genre:travel-writing",
    "genre:cultural-history",
  ],
  "of_human_bondage": [
    "genre:british-literature",
    "genre:bildungsroman",
    "genre:classic-literature",
  ],
  "of_the_nature_of_things": [
    "genre:philosophy",
    "genre:classics",
    "genre:science",
  ],
  "on_the_origin_of_species": [
    "genre:science",
    "genre:natural-history",
    "genre:nonfiction",
  ],
  "poems_of_emily_dickinson": ["genre:poetry", "genre:american-literature"],
  "sense_and_sensibility": [
    "genre:british-literature",
    "genre:classic-literature",
    "genre:comedy-of-manners",
  ],
  "spoon_river_anthology": ["genre:poetry", "genre:american-literature"],
  "black_tulip": [
    "genre:historical-fiction",
    "genre:french-literature",
    "genre:adventure-fiction",
  ],
  "discovery_and_conquest_of_mexico": [
    "genre:history",
    "genre:exploration",
    "genre:nonfiction",
  ],
  "gallic_wars": ["genre:history", "genre:classics", "genre:military-history"],
  "idiot": [
    "genre:russian-literature",
    "genre:psychological-fiction",
    "genre:classic-literature",
  ],
  "life_and_voyages_of_christopher_columbus": [
    "genre:biography",
    "genre:history",
    "genre:exploration",
  ],
  "lives_of_the_most_eminent_painters": [
    "genre:art-history",
    "genre:biography",
    "genre:renaissance",
  ],
  "physiology_of_taste": [
    "genre:food-writing",
    "genre:essays",
    "genre:french-literature",
  ],
  "tales_of_maupassant": [
    "genre:short-stories",
    "genre:french-literature",
    "genre:classic-literature",
  ],
  "three_musketeers": [
    "genre:adventure-fiction",
    "genre:historical-fiction",
    "genre:french-literature",
  ],
  "trail_and_death_of_socrates": [
    "genre:philosophy",
    "genre:classics",
    "genre:dialogue",
  ],
  "world_according_to_garp": [
    "genre:american-literature",
    "genre:literary-fiction",
    "genre:contemporary-fiction",
  ],
  "trick_with_a_knife": [
    "genre:poetry",
    "genre:american-literature",
    "genre:contemporary-poetry",
  ],
  "through_naked_branches": [
    "genre:american-literature",
    "genre:literary-fiction",
  ],
  "to_the_lighthouse": [
    "genre:british-literature",
    "genre:modernism",
    "genre:literary-fiction",
  ],
  "tono_bungay": [
    "genre:british-literature",
    "genre:social-fiction",
    "genre:classic-literature",
  ],
  "two_years_before_the_mast": [
    "genre:travel-writing",
    "genre:memoir",
    "genre:maritime",
  ],
  "war_and_peace": [
    "genre:russian-literature",
    "genre:historical-fiction",
    "genre:classic-literature",
  ],
};

function assignGenreTags() {
  ensureDatabaseSchema(db);

  const works = db.prepare("SELECT id, title FROM works ORDER BY title").all();
  const missingMappings = works.filter((work) => !genreTagsByWorkId[work.id]);
  if (missingMappings.length > 0) {
    throw new Error(
      `Missing genre mappings for: ${missingMappings.map((work) => work.title).join(", ")}`,
    );
  }

  const unknownMappings = Object.keys(genreTagsByWorkId).filter(
    (workId) => !works.some((work) => work.id === workId),
  );
  if (unknownMappings.length > 0) {
    throw new Error(
      `Genre mapping contains unknown work ids: ${unknownMappings.join(", ")}`,
    );
  }

  const insertTag = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
  const findTagId = db.prepare("SELECT id FROM tags WHERE name = ?");
  const clearGenreWorkTags = db.prepare(`
    DELETE FROM work_tags
    WHERE tag_id IN (
      SELECT id FROM tags WHERE name LIKE 'genre:%'
    )
  `);
  const linkTag = db.prepare(
    "INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?, ?)",
  );

  const appliedTags = new Set();

  db.transaction(() => {
    clearGenreWorkTags.run();

    for (const work of works) {
      for (const tagName of genreTagsByWorkId[work.id]) {
        insertTag.run(tagName);
        const tagId = findTagId.get(tagName)?.id;
        if (!tagId) {
          throw new Error(`Failed to resolve tag id for ${tagName}`);
        }
        linkTag.run(work.id, tagId);
        appliedTags.add(tagName);
      }
    }
  })();

  console.log(
    `Assigned ${appliedTags.size} genre tags across ${works.length} works.`,
  );
  console.log([...appliedTags].sort().join("\n"));
}

try {
  assignGenreTags();
} catch (error) {
  console.error("Failed to assign work genre tags:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
