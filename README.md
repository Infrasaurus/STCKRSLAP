# STCKRSLAP
Share stickers with your friends (or strangers) on this virtual lamp pole!

## What is STCKRSLAP?
STCKRSLAP aims to recreate the sticker-slapping experience in a virtual environment.  No cops, no fines, no judgement; just good, old-fashioned sticker slapping!

## How do I use STCKRSLAP?
I tried to make it as simple as can be! Go to the URL of a STCKRSLAP site, drag in your PNG, JPG, or WEBP file into position, and **BAM!**, you've just slapped a sticker.

Want to rotate your sticker? Click it, drag it around in a circle, and release when you're satisfied with its rotation.  Be careful, as you can only do this once!

Want to scrape a sticker? Click outside of the sticker, and drag in a line.  Voila!  You've just defaced a perfectly good sticker, you absolute _artiste_.

## How do I run my own STCKRSLAP?
STCKRSLAP is provided in a super convenient container, making hosting a breeze! You can run the container as-is and expose port 10014 for a quick and easy (if insecure) STCKRSLAP instance, or put it behind a reverse proxy or load balancer to make it more secure before exposing it to the internet.

Want the instance to be a little more private? You can define a unique string to join in the `{INVITE_KEY}` environment variable; append this to the end of the URL to join (e.g., `https://www.your.site/INVITE_KEY`).

## How do I save my STCKRSLAP?
Why would you want to? The beauty of slapping stickers is you never know how long they'll last before the pole is scraped, painted, or cleaned up in real life - and we do the same thing by storing no permanent data, not even user identifiers.  When the container resets, so does the canvas!

That said, nothing's stopping you from capturing screenshots of your artwork.  If you're proud of your work, snap away!

## Can I sell this in some form?
**No, you absolutely cannot!** This project was provided to the world gratis, but on the sole condition that you cannot sell this project in any form (even selling it as a hosted app service, a la AWS or Digital Ocean) without consulting me first.

If you wanna modify its code? Go for it! Same license applies, though (no commercial use without consulting me first).  Wanna host it on Hetzner for your friends out of your own pocket? Sure thing!  Want to turn it into a hosted service you charge others for? **Fuck you, pay me!**