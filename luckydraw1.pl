#!/usr/bin/perl
use strict;
use warnings;
use utf8;
binmode(STDOUT, ":utf8");

use Prima;
use Prima::Application;
use Prima::Buttons;

# === 主窗口 ===
my $main = Prima::MainWindow->create(
    text      => '年会抽奖 - 按按钮开始',
    size      => [500, 300],
    centered  => 1,
    backColor => 0xC41E3A,  # 中国红基调
);

# 大按钮（也改成喜庆风格）
$main->insert('Button' =>
    text      => '开始年会抽奖动画！',
    font      => { size => 36, style => fs::Bold },
    size      => [420, 140],
    centered  => 1,
    backColor => 0xFFD700,  # 金色按钮
    color     => 0xC41E3A,  # 红字
    onClick   => sub {
        start_fullscreen_animation();
    },
);

# === 全屏年会烟花动画 ===
sub start_fullscreen_animation {
    my ($w, $h) = $::application->size;

    # 粒子列表（烟花碎片 + 火箭 + 灯笼）
    my @particles;
    my @lanterns;           # 小灯笼
    my $text_y = $h + 150;

    # 初始化一些飘落灯笼
    for (1..8) {
        push @lanterns, {
            x    => rand($w),
            y    => rand($h * 0.3) + $h * 0.1,  # 上半屏开始
            vy   => rand(1.5) + 0.8,            # 缓慢下落
            size => rand(40) + 30,
            sway => rand(0.02) + 0.01,          # 左右摇摆幅度
            phase=> rand(6.28),                 # 摇摆相位
        };
    }

    my $anim = Prima::Window->create(
        text           => '',
        origin         => [0, 0],
        size           => [$w, $h],
        # layered      => 1,   # 注释掉，避免键盘问题
        clipOwner      => 0,
        borderIcons    => 0,
        borderStyle    => bs::None,
        windowState    => ws::Maximized,
        onKeyDown      => sub {
            my ($self, $code, $key, $mod) = @_;
            if ($key == kb::Esc) {
                my $timer = $self->find_component('AnimationTimer');
                $timer->stop if $timer;
                $self->destroy;
            }
        },
        onPaint        => sub {
            my ($self, $canvas) = @_;

            # 背景：深红渐变（模拟喜庆）
            $canvas->color(0x8B0000);  # 暗红
            $canvas->bar(0, 0, $w, $h);
            $canvas->color(0xC41E3A);  # 亮红覆盖上半部
            $canvas->bar(0, 0, $w, $h * 0.6);

            # 画飘落灯笼（红色 + 金边 + 穗子）
            for my $l (@lanterns) {
                my $x = $l->{x} + sin($l->{phase} + time() * 2) * 30 * $l->{sway};  # 左右摇
                my $y = $l->{y};

                # 灯笼主体（圆角矩形简化）
                $canvas->color(0xFF4500);  # 橙红
                $canvas->backColor(0xFFD700);  # 金色高光
                $canvas->ellipse($x, $y, $l->{size}, $l->{size} * 1.2);

                # 金色边框
                $canvas->color(0xFFD700);
                $canvas->ellipse($x, $y, $l->{size}+4, $l->{size}*1.2 +4);

                # 穗子（简单几条线）
                $canvas->color(0xFFD700);
                for my $i (0..4) {
                    my $dx = ($i-2)*4;
                    $canvas->line($x+$dx, $y + $l->{size}*0.6, $x+$dx, $y + $l->{size}*1.1);
                }
            }

            # 画烟花粒子
            for my $p (@particles) {
                next unless $p->{life} > 0;
                $canvas->color($p->{color} | (int($p->{life} * 255) << 24));  # alpha = life
                $canvas->ellipse(int($p->{x}), int($p->{y}), $p->{size}, $p->{size});
            }

            # 滚动大祝福文字（金色 + 红描边模拟）
            $canvas->font({ size => 90, style => fs::Bold });
            my $big_text = "恭喜发财！中大奖啦！";
            my $tw = $canvas->get_text_width($big_text);
            # 红描边（多偏移绘制）
            $canvas->color(0x8B0000);
            for my $dx (-3,3) { for my $dy (-3,3) {
                $canvas->text_out($big_text, ($w - $tw)/2 + $dx, $text_y + $dy);
            }}
            # 金色主体
            $canvas->color(0xFFD700);
            $canvas->text_out($big_text, ($w - $tw)/2, $text_y);

            # 小字
            $canvas->font({ size => 60 });
            $canvas->color(0xFF69B4);  # 热粉
            my $small = "年会抽奖 好运来袭～～";
            $tw = $canvas->get_text_width($small);
            $canvas->text_out($small, ($w - $tw)/2, $text_y - 140);
        },
        onClick        => sub {  # 备用退出
            my ($self) = @_;
            my $timer = $self->find_component('AnimationTimer');
            $timer->stop if $timer;
            $self->destroy;
        },
    );

    # 定时器
    $anim->insert(Timer =>
        name     => 'AnimationTimer',
        timeout  => 40,
        onTick   => sub {
            # 更新灯笼下落 + 摇摆
            for my $l (@lanterns) {
                $l->{y} += $l->{vy};
                if ($l->{y} > $h + 100) {
                    $l->{y} = -50;
                    $l->{x} = rand($w);
                }
            }

            # 更新烟花粒子
            for my $p (@particles) {
                next unless $p->{life} > 0;
                $p->{x} += $p->{vx};
                $p->{y} += $p->{vy};
                $p->{vy} += 0.15;          # 重力下落
                $p->{life} -= 0.008;       # 渐隐
                $p->{size} = max(1, $p->{size} * 0.99);
            }

            # 随机发射新火箭（烟花）
            if (rand() < 0.08) {  # 概率控制密度
                my $start_x = rand($w);
                my $target_y = rand($h * 0.4) + $h * 0.1;  # 爆炸高度
                push @particles, {  # 火箭本身（用大粒子模拟）
                    x     => $start_x,
                    y     => $h + 50,
                    vx    => ($start_x - $w/2) * 0.0005 + rand(2)-1,  # 略微偏向中心
                    vy    => - (rand(8) + 12),   # 向上冲
                    life  => 1.2,
                    size  => 6,
                    color => 0xFFFF00 | 0xFF000000,  # 金色带尾迹
                };

                # 到达顶点后爆炸（在下一个tick判断）
            }

            # 检查并爆炸火箭
            for (my $i = $#particles; $i >= 0; $i--) {
                my $p = $particles[$i];
                if ($p->{vy} > 0 && $p->{life} > 0.8) {  # 开始下落且还亮 → 爆炸
                    my $expl_x = $p->{x};
                    my $expl_y = $p->{y};
                    my $color_base = (rand() > 0.5) ? 0xFFD700 : (rand() > 0.5 ? 0xFF4500 : 0x00FF7F);
                    for (1..60) {  # 爆炸粒子
                        my $angle = rand(6.28);
                        my $speed = rand(6) + 3;
                        push @particles, {
                            x     => $expl_x,
                            y     => $expl_y,
                            vx    => cos($angle) * $speed,
                            vy    => sin($angle) * $speed - 2,  # 稍向上偏
                            life  => 1.0 + rand(0.4),
                            size  => rand(4) + 2,
                            color => $color_base,
                        };
                    }
                    splice(@particles, $i, 1);  # 移除火箭
                }
            }

            $text_y -= 1.2;
            if ($text_y < -300) { $text_y = $h + 150; }

            $anim->repaint;
        },
    );

    $anim->bring_to_front;
    $anim->select;
    $anim->focus;
    $anim->AnimationTimer->start;
}

sub max { $_[0] > $_[1] ? $_[0] : $_[1] }

run Prima;