-- Updates the founder's title inside Kumar's testimonial body, at Sathiya's
-- explicit instruction: "As Solution Architect," becomes
-- "As Director & Solution Architect,".
--
-- Recorded plainly because this edits quoted words. The rest of the
-- testimonial is untouched, and the change is a title substitution rather than
-- a trim, so the page's "never edited for length" line remains accurate. If
-- Saravanakumar Sakthivel ever asks what his testimonial says, this migration
-- is the record of what was altered and why.
--
-- REPLACE rather than a rewritten string: it changes exactly this phrase and
-- cannot silently alter the rest of the text. Verified beforehand that the
-- phrase occurs exactly once.
UPDATE testimonials
   SET body = replace(body, 'As Solution Architect,', 'As Director & Solution Architect,')
 WHERE id = '00000000-0000-4000-8000-000000000101';
