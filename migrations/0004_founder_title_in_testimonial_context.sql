-- Corrects the founder's title in the context line attached to Kumar's
-- testimonial: "Solution Architect" becomes "Director & Solution Architect",
-- matching how the title is given on the homepage.
--
-- This is a new migration rather than an edit to 0003, because 0003 has
-- already been applied to production. Wrangler tracks applied migrations by
-- name and will not re-run one, so editing it in place would leave a fresh
-- database and the live database saying different things.
--
-- Only the `relationship` field is touched. That line is Okayma's own summary
-- of how the author knows the work. The testimonial `body` is deliberately
-- left alone: those are Saravanakumar Sakthivel's words, and the page they
-- appear on promises they are reproduced in full. Changing a title inside a
-- quotation would put a claim in a named person's mouth that he did not make.
UPDATE testimonials
   SET relationship = 'Worked together on an e-commerce platform for small businesses during the pandemic, with Sathiya as Director & Solution Architect.'
 WHERE id = '00000000-0000-4000-8000-000000000101';
