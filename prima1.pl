use strict;
use warnings;
use Prima qw(Application Label);

my $mw = Prima::MainWindow->create(
    text => 'Hello Prima',
    size => [400, 300],
    centered => 1,
);

$mw->insert('Label' => {
    text => 'Hello World!',
    font => { size => 24, style => 1 },
    alignment => 1,
    valignment => 1,
    pack => { expand => 1, fill => 'both' },
});

Prima->run;
