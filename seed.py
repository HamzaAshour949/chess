"""Seed script to initialize the database and create an admin user."""
import json
import os
from app import create_app, db
from app.models import Admin, Player, News, SiteString
from datetime import datetime

app = create_app()

with app.app_context():
    db.create_all()

    # Create admin if none exists
    if Admin.query.count() == 0:
        admin = Admin(username="admin", email="admin@chess.com")
        admin.set_password("admin123")
        db.session.add(admin)
        print("Created admin user: admin / admin123")

    # Add sample players if none exist
    if Player.query.count() == 0:
        players = [
            Player(
                name_en="Magnus Carlsen",
                name_ar="ماغنوس كارلسن",
                bio_en="Norwegian chess grandmaster, widely regarded as the greatest chess player of all time. He held the World Chess Championship title from 2013 to 2023.",
                bio_ar="أستاذ كبير نرويجي في الشطرنج، يُعتبر على نطاق واسع أعظم لاعب شطرنج في التاريخ. حمل لقب بطل العالم في الشطرنج من 2013 إلى 2023.",
                country="Norway",
                rating=2830,
                title="GM",
                date_of_birth=datetime(1990, 11, 30).date(),
                image_url="https://placehold.co/400x300/1e293b/f59e0b?text=Carlsen",
            ),
            Player(
                name_en="Ding Liren",
                name_ar="دينغ ليرين",
                bio_en="Chinese chess grandmaster and the reigning World Chess Champion. Known for his solid positional style and deep endgame technique.",
                bio_ar="أستاذ كبير صيني في الشطرنج وبطل العالم الحالي. يُعرف بأسلوبه الموضعي المتين وتقنيته العميقة في نهاية اللعب.",
                country="China",
                rating=2780,
                title="GM",
                date_of_birth=datetime(1992, 10, 24).date(),
                image_url="https://placehold.co/400x300/1e293b/60a5fa?text=Ding+Liren",
            ),
            Player(
                name_en="Hikaru Nakamura",
                name_ar="هيكارو ناكامورا",
                bio_en="American chess grandmaster and one of the most popular chess streamers in the world. Five-time US Chess Champion known for his aggressive blitz play.",
                bio_ar="أستاذ كبير أمريكي في الشطرنج ومن أشهر ناشري محتوى الشطرنج في العالم. بطل الشطرنج الأمريكي خمس مرات ويُعرف بلعبه الهجومي في الخاطف.",
                country="USA",
                rating=2760,
                title="GM",
                date_of_birth=datetime(1987, 12, 9).date(),
                image_url="https://placehold.co/400x300/1e293b/f472b6?text=Nakamura",
            ),
            Player(
                name_en="Fabiano Caruana",
                name_ar="فابيانو كاروانا",
                bio_en="Italian-American chess grandmaster who challenged Magnus Carlsen for the World Championship in 2018. Known for his exceptional opening preparation.",
                bio_ar="أستاذ كبير إيطالي-أمريكي في الشطرنج نافس كارلسن على بطولة العالم في 2018. يُعرف بتحضيره الاستثنائي للافتتاحيات.",
                country="USA",
                rating=2795,
                title="GM",
                date_of_birth=datetime(1992, 7, 30).date(),
                image_url="https://placehold.co/400x300/1e293b/34d399?text=Caruana",
            ),
            Player(
                name_en="Alireza Firouzja",
                name_ar="علي رضا فيروزجا",
                bio_en="French-Iranian chess prodigy who became the youngest player ever to reach 2800 FIDE rating. Known for his creative and dynamic playing style.",
                bio_ar="معجزة شطرنجية فرنسية-إيرانية، أصبح أصغر لاعب في التاريخ يصل إلى تصنيف 2800 فيدي. يُعرف بأسلوبه الإبداعي والديناميكي.",
                country="France",
                rating=2785,
                title="GM",
                date_of_birth=datetime(2003, 6, 18).date(),
                image_url="https://placehold.co/400x300/1e293b/a78bfa?text=Firouzja",
            ),
            Player(
                name_en="Ian Nepomniachtchi",
                name_ar="إيان نيبومنياتشي",
                bio_en="Russian chess grandmaster who twice challenged for the World Chess Championship. Known for his fast and intuitive playing style.",
                bio_ar="أستاذ كبير روسي في الشطرنج نافس على بطولة العالم مرتين. يُعرف بأسلوبه السريع والحدسي في اللعب.",
                country="Russia",
                rating=2770,
                title="GM",
                date_of_birth=datetime(1990, 7, 14).date(),
                image_url="https://placehold.co/400x300/1e293b/fb923c?text=Nepo",
            ),
            Player(
                name_en="Rameshbabu Praggnanandhaa",
                name_ar="راميشبابو براغناناندا",
                bio_en="Indian chess prodigy who became the youngest International Master in history. Rising star with victories over multiple World Champions.",
                bio_ar="معجزة شطرنجية هندية أصبح أصغر أستاذ دولي في التاريخ. نجم صاعد حقق انتصارات على عدة أبطال عالم.",
                country="India",
                rating=2747,
                title="GM",
                date_of_birth=datetime(2005, 8, 10).date(),
                image_url="https://placehold.co/400x300/1e293b/fbbf24?text=Pragg",
            ),
            Player(
                name_en="Gukesh Dommaraju",
                name_ar="غوكيش دوماراجو",
                bio_en="Indian chess grandmaster and one of the youngest GMs ever. A key member of India's gold medal-winning Olympiad team.",
                bio_ar="أستاذ كبير هندي في الشطرنج ومن أصغر الحاصلين على لقب أستاذ كبير. عضو أساسي في فريق الهند الفائز بالميدالية الذهبية في الأولمبياد.",
                country="India",
                rating=2758,
                title="GM",
                date_of_birth=datetime(2006, 5, 29).date(),
                image_url="https://placehold.co/400x300/1e293b/2dd4bf?text=Gukesh",
            ),
            Player(
                name_en="Anish Giri",
                name_ar="أنيش غيري",
                bio_en="Dutch chess grandmaster born in Russia, known for his solid and positional style. Consistently ranked in the world's top 10.",
                bio_ar="أستاذ كبير هولندي ولد في روسيا، يُعرف بأسلوبه المتين والموضعي. يحتل باستمرار مراكز ضمن أفضل 10 في العالم.",
                country="Netherlands",
                rating=2740,
                title="GM",
                date_of_birth=datetime(1994, 6, 28).date(),
                image_url="https://placehold.co/400x300/1e293b/e879f9?text=Giri",
            ),
            Player(
                name_en="Nodirbek Abdusattorov",
                name_ar="نودربك عبد الستاروف",
                bio_en="Uzbek chess grandmaster who won the World Rapid Championship at age 17, defeating Carlsen and Caruana along the way.",
                bio_ar="أستاذ كبير أوزبكي في الشطرنج فاز ببطولة العالم للسريع عن عمر 17 عاماً، متغلباً على كارلسن وكاروانا.",
                country="Uzbekistan",
                rating=2727,
                title="GM",
                date_of_birth=datetime(2004, 9, 18).date(),
                image_url="https://placehold.co/400x300/1e293b/f87171?text=Abdusattorov",
            ),
            Player(
                name_en="Salem Saleh",
                name_ar="سالم صالح",
                bio_en="Emirati chess grandmaster and the highest-rated Arab chess player. A pioneer for chess in the Middle East region.",
                bio_ar="أستاذ كبير إماراتي في الشطرنج وأعلى لاعب عربي تصنيفاً. رائد في الشطرنج في منطقة الشرق الأوسط.",
                country="UAE",
                rating=2694,
                title="GM",
                date_of_birth=datetime(1993, 8, 31).date(),
                image_url="https://placehold.co/400x300/1e293b/4ade80?text=Salem",
            ),
            Player(
                name_en="Amin Bassem",
                name_ar="باسم أمين",
                bio_en="Egyptian chess grandmaster and Africa's first player to cross the 2700 rating barrier. Multiple-time African Champion.",
                bio_ar="أستاذ كبير مصري في الشطرنج وأول لاعب أفريقي يتخطى حاجز تصنيف 2700. بطل أفريقيا عدة مرات.",
                country="Egypt",
                rating=2704,
                title="GM",
                date_of_birth=datetime(1988, 9, 1).date(),
                image_url="https://placehold.co/400x300/1e293b/38bdf8?text=Bassem",
            ),
        ]
        db.session.add_all(players)
        db.session.flush()

        # Add sample news — bilingual, English-only, and Arabic-only
        news_items = [
            News(
                title_en="Carlsen Wins Rapid Championship in Dominant Fashion",
                title_ar="كارلسن يفوز ببطولة العالم للسريع بأداء مهيمن",
                content_en="Magnus Carlsen once again proved his dominance in rapid chess by winning the World Rapid Championship. The Norwegian scored an impressive 10.5/13, losing only one game throughout the entire tournament. His victory cements his status as the greatest rapid player of all time.",
                content_ar="أثبت ماغنوس كارلسن مرة أخرى هيمنته في الشطرنج السريع بفوزه ببطولة العالم للسريع. سجل النرويجي 10.5 من 13 نقطة، وخسر مباراة واحدة فقط طوال البطولة. يعزز فوزه مكانته كأعظم لاعب سريع في التاريخ.",
                region="both",
                published=True,
                published_at=datetime(2026, 3, 15),
                player_id=players[0].id,
                image_url="https://placehold.co/800x400/1e293b/f59e0b?text=Carlsen+Wins+Rapid",
            ),
            News(
                title_en="Ding Liren Defends World Title in Thrilling Match",
                title_ar="دينغ ليرين يدافع عن لقبه العالمي في مباراة مثيرة",
                content_en="World Champion Ding Liren successfully defended his title in a grueling 14-game match that went to tiebreaks. The Chinese grandmaster showed remarkable resilience, coming back from a two-game deficit to level the score and ultimately prevail in rapid playoffs.",
                content_ar="نجح بطل العالم دينغ ليرين في الدفاع عن لقبه في مباراة شاقة من 14 جولة وصلت إلى الأدوار الفاصلة. أظهر الأستاذ الكبير الصيني مرونة رائعة، عائداً من تأخر بنقطتين ليعادل النتيجة وينتصر في النهاية في الأدوار السريعة.",
                region="both",
                published=True,
                published_at=datetime(2026, 3, 10),
                player_id=players[1].id,
                image_url="https://placehold.co/800x400/1e293b/60a5fa?text=Ding+Defends+Title",
            ),
            News(
                title_en="Nakamura Breaks Twitch Streaming Record with 100K Viewers",
                title_ar=None,
                content_en="Hikaru Nakamura shattered streaming records during his coverage of the World Championship, attracting over 100,000 concurrent viewers on Twitch. The American grandmaster's entertaining commentary and rapid analysis have made him the most-watched chess personality online.",
                content_ar=None,
                region="en",
                published=True,
                published_at=datetime(2026, 3, 8),
                player_id=players[2].id,
                image_url="https://placehold.co/800x400/1e293b/f472b6?text=Nakamura+Streaming",
            ),
            News(
                title_en="Firouzja Returns to Top Form with Tournament Victory",
                title_ar="فيروزجا يعود لأفضل مستوياته بفوزه ببطولة كبرى",
                content_en="After a period of inconsistent results, Alireza Firouzja stormed back to the top with a dominant performance at the Tata Steel Masters. The French-Iranian prodigy won the tournament with a round to spare, reminding the chess world of his immense talent.",
                content_ar="بعد فترة من النتائج غير المستقرة، عاد علي رضا فيروزجا بقوة إلى القمة بأداء مهيمن في بطولة تاتا ستيل للأساتذة. فاز المعجزة الفرنسية-الإيرانية بالبطولة قبل جولة من النهاية، مذكراً عالم الشطرنج بموهبته الهائلة.",
                region="both",
                published=True,
                published_at=datetime(2026, 2, 28),
                player_id=players[4].id,
                image_url="https://placehold.co/800x400/1e293b/a78bfa?text=Firouzja+Returns",
            ),
            News(
                title_en=None,
                title_ar="بطولة الشطرنج العربية الكبرى تنطلق الشهر المقبل",
                content_en=None,
                content_ar="تنطلق بطولة الشطرنج العربية الكبرى الشهر المقبل في الرياض بمشاركة أبرز اللاعبين من المنطقة العربية. تشهد البطولة مشاركة أكثر من 200 لاعب من 20 دولة عربية، وتُقام تحت رعاية الاتحاد العربي للشطرنج بجوائز تتجاوز 500 ألف دولار.",
                region="ar",
                published=True,
                published_at=datetime(2026, 3, 20),
                player_id=None,
                image_url="https://placehold.co/800x400/1e293b/fbbf24?text=بطولة+عربية",
            ),
            News(
                title_en="Praggnanandhaa Stuns Carlsen in Classical Game",
                title_ar="براغناناندا يفاجئ كارلسن في مباراة كلاسيكية",
                content_en="Indian prodigy Rameshbabu Praggnanandhaa defeated Magnus Carlsen in a brilliantly played classical game at the Norway Chess tournament. The 20-year-old showcased exceptional endgame technique to convert a slight advantage into a full point against the legendary Norwegian.",
                content_ar="فاجأ المعجزة الهندي راميشبابو براغناناندا ماغنوس كارلسن في مباراة كلاسيكية رائعة في بطولة النرويج للشطرنج. أظهر اللاعب البالغ 20 عاماً تقنية استثنائية في نهاية اللعب لتحويل ميزة طفيفة إلى نقطة كاملة ضد الأسطورة النرويجية.",
                region="both",
                published=True,
                published_at=datetime(2026, 2, 20),
                player_id=players[6].id,
                image_url="https://placehold.co/800x400/1e293b/fbbf24?text=Pragg+vs+Carlsen",
            ),
            News(
                title_en="Gukesh Becomes Youngest Candidates Winner",
                title_ar="غوكيش يصبح أصغر فائز بدورة المرشحين",
                content_en="At just 19 years old, Gukesh Dommaraju has won the Candidates Tournament, earning the right to challenge for the World Championship. The Indian sensation went undefeated through 14 rounds, playing with a maturity far beyond his years.",
                content_ar="في عمر 19 عاماً فقط، فاز غوكيش دوماراجو بدورة المرشحين ليحصل على حق التحدي على لقب بطولة العالم. لم يخسر الموهبة الهندية أي مباراة خلال 14 جولة، ولعب بنضج يفوق سنه بكثير.",
                region="both",
                published=True,
                published_at=datetime(2026, 2, 15),
                player_id=players[7].id,
                image_url="https://placehold.co/800x400/1e293b/2dd4bf?text=Gukesh+Candidates",
            ),
            News(
                title_en=None,
                title_ar="سالم صالح يحقق إنجازاً تاريخياً للشطرنج العربي",
                content_en=None,
                content_ar="حقق الأستاذ الكبير الإماراتي سالم صالح إنجازاً تاريخياً بتأهله إلى دورة المرشحين لبطولة العالم للشطرنج، ليصبح أول لاعب عربي يصل إلى هذه المرحلة المتقدمة. يأتي هذا الإنجاز تتويجاً لمسيرة حافلة بالنجاحات على المستوى الإقليمي والدولي.",
                region="ar",
                published=True,
                published_at=datetime(2026, 3, 5),
                player_id=players[10].id,
                image_url="https://placehold.co/800x400/1e293b/4ade80?text=سالم+صالح",
            ),
            News(
                title_en="US Chess Championship Preview: Caruana vs Nakamura Headline",
                title_ar=None,
                content_en="The 2026 US Chess Championship promises to be one of the most exciting editions yet, with Fabiano Caruana and Hikaru Nakamura leading a stacked field. Both players are in exceptional form heading into the tournament, setting the stage for an epic rivalry showdown.",
                content_ar=None,
                region="en",
                published=True,
                published_at=datetime(2026, 3, 25),
                player_id=players[3].id,
                image_url="https://placehold.co/800x400/1e293b/34d399?text=US+Championship",
            ),
            News(
                title_en="Abdusattorov Leads Uzbekistan to Historic Olympiad Gold",
                title_ar="عبد الستاروف يقود أوزبكستان لذهبية تاريخية في الأولمبياد",
                content_en="Nodirbek Abdusattorov led Uzbekistan to a stunning gold medal at the Chess Olympiad, with a dominant individual performance on board one. The young grandmaster scored 9/11, including victories over three top-10 players.",
                content_ar="قاد نودربك عبد الستاروف أوزبكستان لميدالية ذهبية مذهلة في أولمبياد الشطرنج، بأداء فردي مهيمن على الرقعة الأولى. سجل الأستاذ الكبير الشاب 9 من 11 نقطة، متضمنة انتصارات على ثلاثة من أفضل 10 لاعبين في العالم.",
                region="both",
                published=True,
                published_at=datetime(2026, 1, 30),
                player_id=players[9].id,
                image_url="https://placehold.co/800x400/1e293b/f87171?text=Uzbekistan+Gold",
            ),
            News(
                title_en=None,
                title_ar="باسم أمين يكسر حاجز تصنيف 2700 مجدداً",
                content_en=None,
                content_ar="عاد الأستاذ الكبير المصري باسم أمين لتخطي حاجز تصنيف 2700 بعد أدائه المتميز في بطولة جبل طارق للشطرنج. يؤكد هذا الإنجاز مكانته كأحد أبرز اللاعبين في القارة الأفريقية والوطن العربي.",
                region="ar",
                published=True,
                published_at=datetime(2026, 2, 5),
                player_id=players[11].id,
                image_url="https://placehold.co/800x400/1e293b/38bdf8?text=باسم+أمين",
            ),
            News(
                title_en="Chess AI Reaches New Milestone: Can It Beat Stockfish?",
                title_ar="الذكاء الاصطناعي يصل لمستوى جديد في الشطرنج",
                content_en="A new AI chess engine has emerged that challenges the supremacy of Stockfish. Developed by a team of researchers, the engine uses a novel neural network architecture that evaluates positions in fundamentally different ways than traditional engines.",
                content_ar="ظهر محرك شطرنج جديد بالذكاء الاصطناعي ينافس على صدارة ستوكفيش. طوره فريق من الباحثين، ويستخدم المحرك بنية شبكة عصبية مبتكرة تقيّم المواقف بطرق مختلفة جذرياً عن المحركات التقليدية.",
                region="both",
                published=True,
                published_at=datetime(2026, 3, 28),
                player_id=None,
                image_url="https://placehold.co/800x400/1e293b/c084fc?text=Chess+AI",
            ),
            News(
                title_en="Nepomniachtchi Announces Retirement from World Championship Cycle",
                title_ar=None,
                content_en="Ian Nepomniachtchi has announced he will no longer compete in the World Championship cycle, focusing instead on individual tournaments and rapid events. After two unsuccessful World Championship matches, the Russian grandmaster says he wants to enjoy chess without the pressure.",
                content_ar=None,
                region="en",
                published=True,
                published_at=datetime(2026, 1, 15),
                player_id=players[5].id,
                image_url="https://placehold.co/800x400/1e293b/fb923c?text=Nepo+Announcement",
            ),
            News(
                title_en="Giri Wins Dutch Championship for Record 5th Time",
                title_ar="غيري يفوز ببطولة هولندا للمرة الخامسة",
                content_en="Anish Giri claimed his fifth Dutch Championship title, extending his own record. The Netherlands' top player won the event with a round to spare, showcasing his trademark solid and uncompromising style.",
                content_ar="حصد أنيش غيري لقب بطولة هولندا للمرة الخامسة، محطماً رقمه القياسي. فاز أفضل لاعب في هولندا بالبطولة قبل جولة من النهاية، مستعرضاً أسلوبه المتين والحازم المعروف.",
                region="both",
                published=True,
                published_at=datetime(2026, 1, 20),
                player_id=players[8].id,
                image_url="https://placehold.co/800x400/1e293b/e879f9?text=Giri+Dutch+Champion",
            ),
        ]
        db.session.add_all(news_items)
        print("Added 12 sample players and 14 news articles")

    # Seed site strings from locale files
    if SiteString.query.count() == 0:
        frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "src", "locales")
        for lang_code in ["en", "ar"]:
            locale_file = os.path.join(frontend_dir, f"{lang_code}.json")
            if os.path.exists(locale_file):
                with open(locale_file, "r", encoding="utf-8") as f:
                    strings = json.load(f)
                for key, value in strings.items():
                    db.session.add(SiteString(key=key, lang=lang_code, value=value))
        print("Seeded site strings from locale files")

    db.session.commit()
    print("Database seeded successfully!")
